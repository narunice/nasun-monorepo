/**
 * nasun-ai-host — box HTTP front for the AI host (formerly the `baram/executor`
 * Lambda behind the prod API Gateway).
 *
 * The 2026-07 AWS exit removed that API Gateway without migrating it, which is
 * why every trader cycle had been failing at `deps.infer(trader.hostUrl, ...)`:
 * the hostname stopped resolving. This service restores `/infer` and
 * `/execute-capability` (and with them `/execute`, `/record`, `/result`,
 * `/info`, `/health`) on the box.
 *
 * Two deliberate choices:
 *
 *   - handler.ts is the production Lambda handler, kept as-is. It is the
 *     audited AER settlement path, so this file adapts the transport around it
 *     rather than rewriting it. The adapter builds exactly the fields the
 *     handler ever read off APIGatewayProxyEvent.
 *   - The listener binds loopback only. API Gateway enforced an API key in
 *     front of the Lambda (`apiKeyRequired`); there is no gateway here, and
 *     both callers — chat-server and the per-agent runtimes — are processes on
 *     this host. Loopback is therefore the primary control, matching the
 *     runtime's own /wake server, and HOST_API_KEY is defence in depth for it.
 *     Nothing in nginx routes to this port; do not add a route.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { handler, type HostRequest } from './handler';
import { pruneExpiredResults } from './services/resultStore';

const PORT = Number(process.env.HOST_PORT ?? 4500);
const BIND = process.env.HOST_BIND ?? '127.0.0.1';

// The Lambda rejected prompts over ~1MB of base64 inside the handler. Cap the
// transport too, so an oversized body is refused before it is buffered.
const BODY_MAX_BYTES = 2 * 1024 * 1024;

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Compare against the configured API key without leaking length or position.
 * The absence check is on the string, never on a Buffer: `Buffer.from('')` is
 * truthy and timingSafeEqual(empty, empty) is true, so wrapping first would
 * make a missing key authenticate every request (the 2026-08 issuer incident).
 */
function apiKeyOk(provided: string | undefined): boolean {
  const expected = process.env.HOST_API_KEY;
  if (!expected) return true;             // unset = loopback is the only control
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.length;
      if (size > BODY_MAX_BYTES) {
        // Stop accumulating but leave the socket alive: destroying it here
        // would race the 413 we still owe the caller, and the client would
        // see a bare connection reset instead of a reason. The caller sends
        // the response and tears down afterwards.
        aborted = true;
        chunks.length = 0;
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      resolve(chunks.length ? Buffer.concat(chunks).toString('utf8') : null);
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${BIND}:${PORT}`);

  // /health answers without the API key so an operator or systemd probe can
  // tell "service down" from "key wrong" -- it reveals only the executor
  // address, which is public on chain anyway.
  const isHealthProbe = url.pathname.endsWith('/health') && req.method === 'GET';
  if (!isHealthProbe && req.method !== 'OPTIONS'
      && !apiKeyOk(req.headers['x-api-key'] as string | undefined)) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }

  let body: string | null;
  try {
    body = await readBody(req);
  } catch (err) {
    const tooLarge = (err as Error).message === 'body_too_large';
    send(res, tooLarge ? 413 : 400, { error: tooLarge ? 'body_too_large' : 'bad_request' });
    // Now that the status is on the wire, drop the rest of the upload rather
    // than reading a body we have already refused.
    req.destroy();
    return;
  }

  const queryStringParameters: Record<string, string> = {};
  for (const [k, v] of url.searchParams) queryStringParameters[k] = v;

  const event: HostRequest = {
    httpMethod: req.method ?? 'GET',
    path: url.pathname,
    body,
    headers: req.headers as Record<string, string | undefined>,
    queryStringParameters: Object.keys(queryStringParameters).length ? queryStringParameters : null,
  };

  try {
    const result = await handler(event);
    send(res, result.statusCode, result.body, result.headers ?? {});
  } catch (err) {
    // The handler classifies its own errors and should not throw; anything
    // reaching here is a bug, so log it and answer 500 without echoing the
    // message (request bodies carry prompts and signatures).
    console.error(`[server] unhandled error on ${event.httpMethod} ${event.path}:`, (err as Error).name);
    send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, BIND, () => {
  console.log(`[nasun-ai-host] listening on http://${BIND}:${PORT}`);
  if (!process.env.HOST_API_KEY) {
    console.log('[nasun-ai-host] HOST_API_KEY unset; loopback bind is the only access control');
  }
});

const pruneTimer = setInterval(() => {
  try {
    pruneExpiredResults();
  } catch (err) {
    console.warn('[nasun-ai-host] result prune failed:', (err as Error).message);
  }
}, PRUNE_INTERVAL_MS);
pruneTimer.unref();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[nasun-ai-host] ${signal} received; closing listener`);
    server.close(() => process.exit(0));
  });
}
