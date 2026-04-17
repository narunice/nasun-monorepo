/**
 * Pado Idea / Feedback submission API.
 *
 * Writes directly to the existing `nasun-bug-reports` DynamoDB table using the
 * EC2 instance profile IAM. No Lambda / API Gateway hop. Auth is the chat-server
 * session token (issued over WS after wallet signature verification).
 *
 * Route convention:
 *   POST /api/pado/idea-submit
 *
 * Downstream admin / reward pipeline is shared with nasun bug-reports.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { stripControlChars } from './sanitize.js';
import { resolveIdentityId } from './identity-resolver.js';

// ===== DDB client (lazy init) =====

let ddbClient: DynamoDBDocumentClient | null = null;
function getDdbClient(): DynamoDBDocumentClient {
  if (ddbClient) return ddbClient;
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  return ddbClient;
}

// ===== Config =====

const BUG_REPORTS_TABLE = process.env.PADO_FEEDBACK_TABLE || process.env.BUG_REPORTS_TABLE || 'nasun-bug-reports';

const MAX_TITLE_LEN = 100;
const MAX_DESCRIPTION_LEN = 2000;

const BUG_CATEGORIES = new Set([
  'UI Bug',
  'Wallet Issue',
  'Performance',
  'Security',
  'Feature Request',
  'Feedback',
  'Other',
]);

// Origin-based source hardcoding: the form at /predict is always Feedback.
// Permanent pado UI will pass a different Origin/path pattern in the future.
const PADO_PREDICT_ORIGINS = new Set([
  'https://pado.finance',
  'https://staging.pado.finance',
  'http://localhost:5176',
]);

// ===== Deps =====

export interface PadoIdeaApiDeps {
  resolveSessionToken: (authHeader: string | undefined) => string | null;
}

// ===== Helpers =====

async function readJsonBody<T>(req: IncomingMessage, maxBytes = 16 * 1024): Promise<T | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown, cors: Record<string, string>): void {
  res.writeHead(status, cors);
  res.end(JSON.stringify(body));
}

// reportId format: pado-<uuid-v4>
const PADO_REPORT_ID_RE = /^pado-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface SubmitBody {
  reportId?: string;
  title?: string;
  description?: string;
  category?: string;
}

interface BugReportItem {
  reportId: string;
  timestamp: string;
  identityId: string;
  walletAddress: string;
  title: string;
  category: string;
  description: string;
  status: 'new';
  source: string;
  submittedVia: 'wallet';
  createdAt: string;
  pageUrl?: string;
}

// ===== Main handler =====

/**
 * Returns true if the route was handled (response sent), false otherwise.
 */
export async function handlePadoIdeaRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  corsHeaders: Record<string, string>,
  deps: PadoIdeaApiDeps,
): Promise<boolean> {
  if (url.pathname !== '/api/pado/idea-submit') return false;

  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  if (method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' }, corsHeaders);
    return true;
  }

  // --- Auth ---
  const walletAddress = deps.resolveSessionToken(req.headers.authorization);
  if (!walletAddress) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Valid session token required' }, corsHeaders);
    return true;
  }

  // --- Body ---
  const body = await readJsonBody<SubmitBody>(req);
  if (!body) {
    sendJson(res, 400, { error: 'invalid_body' }, corsHeaders);
    return true;
  }

  // --- Validate reportId (client-generated for idempotency) ---
  const reportId = typeof body.reportId === 'string' ? body.reportId : '';
  if (!PADO_REPORT_ID_RE.test(reportId)) {
    sendJson(res, 400, { error: 'invalid_report_id' }, corsHeaders);
    return true;
  }

  // --- Validate title / description ---
  const rawTitle = typeof body.title === 'string' ? body.title : '';
  const title = stripControlChars(rawTitle).trim().slice(0, MAX_TITLE_LEN);
  if (!title) {
    sendJson(res, 400, { error: 'title_required' }, corsHeaders);
    return true;
  }

  const rawDescription = typeof body.description === 'string' ? body.description : '';
  const description = stripControlChars(rawDescription).trim().slice(0, MAX_DESCRIPTION_LEN);
  if (!description) {
    sendJson(res, 400, { error: 'description_required' }, corsHeaders);
    return true;
  }

  // --- Determine source + category (server-authoritative) ---
  // Temporary /predict form is hardcoded to Feedback. Permanent pado UI (future)
  // will pass through category from the user's selection. For now, any request
  // from pado.finance is treated as the predict-form variant.
  const reqOrigin = req.headers.origin || '';
  const isPadoOrigin = PADO_PREDICT_ORIGINS.has(reqOrigin);
  if (!isPadoOrigin) {
    // Defence in depth: session token might be valid but the request
    // origin is not a known pado origin. Reject.
    sendJson(res, 403, { error: 'forbidden_origin' }, corsHeaders);
    return true;
  }

  const clientCategory = typeof body.category === 'string' ? body.category : '';
  const source = 'pado-predict-form';
  const category = clientCategory && BUG_CATEGORIES.has(clientCategory)
    // Until the permanent UI ships we always override to 'Feedback'.
    // This keeps the temporary form honest even if the client sends a category.
    ? 'Feedback'
    : 'Feedback';

  // --- Resolve identityId ---
  const identityId = await resolveIdentityId(walletAddress);
  if (!identityId) {
    sendJson(res, 401, {
      error: 'NASUN_NOT_REGISTERED',
      message: 'This wallet is not linked to a Nasun account.',
    }, corsHeaders);
    return true;
  }

  // --- Persist ---
  const now = new Date();
  const timestamp = now.toISOString();
  const item: BugReportItem = {
    reportId,
    timestamp,
    identityId,
    walletAddress,
    title,
    category,
    description,
    status: 'new',
    source,
    submittedVia: 'wallet',
    createdAt: timestamp,
  };

  try {
    await getDdbClient().send(new PutCommand({
      TableName: BUG_REPORTS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(reportId)',
    }));
  } catch (err) {
    // ConditionalCheckFailed => idempotent re-submit; treat as success.
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      sendJson(res, 200, { ok: true, reportId, idempotent: true }, corsHeaders);
      return true;
    }
    console.error('[pado-idea] DDB put failed:', err);
    sendJson(res, 500, { error: 'internal_error' }, corsHeaders);
    return true;
  }

  console.log(`[pado-idea] Submission: ${identityId} ${reportId} category=${category} source=${source}`);

  sendJson(res, 200, { ok: true, reportId }, corsHeaders);
  return true;
}
