/**
 * Admin Featured Feed Management
 *
 * GET  /v3/admin/featured-feed  - Get current curated feed (with enriched data)
 * PUT  /v3/admin/featured-feed  - Replace entire curated feed
 *
 * Authentication: Cognito JWT token (admin role)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  BadgeType,
  CuratedFeedEntry,
  MAX_CURATED_ITEMS,
} from '../types';
import { getPostById } from '../services/dynamodb-client';
import {
  getCuratedFeedRecord,
  saveCuratedFeedRecord,
  enrichCuratedItems,
} from '../services/curated-feed';
import { createResponse, getRequestOrigin } from '../utils/response';
import { authenticateAdmin } from '../utils/admin-auth';

const VALID_BADGES: BadgeType[] = [
  'rank-1', 'rank-2', 'rank-3', 'ranker',
  'climber-1', 'climber-2', 'climber-3', 'featured',
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  const admin = await authenticateAdmin(event);
  if (!admin) {
    return respond(401, { success: false, error: 'Unauthorized' });
  }

  try {
    switch (event.httpMethod) {
      case 'GET':
        return await handleGet(respond);
      case 'PUT':
        return await handlePut(event, respond, admin.email || admin.username || 'admin');
      default:
        return respond(405, { success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Admin featured feed error:', error);
    return respond(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};

type Respond = (status: number, body: object) => APIGatewayProxyResult;

async function handleGet(respond: Respond): Promise<APIGatewayProxyResult> {
  const record = await getCuratedFeedRecord();

  if (!record || record.items.length === 0) {
    return respond(200, {
      success: true,
      items: [],
      enrichedItems: [],
      updatedAt: null,
      updatedBy: null,
    });
  }

  // Enrich for preview
  const enrichedItems = await enrichCuratedItems(record.items);

  return respond(200, {
    success: true,
    items: record.items,
    enrichedItems,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  });
}

interface PutRequestBody {
  items: CuratedFeedEntry[];
}

async function handlePut(
  event: APIGatewayProxyEvent,
  respond: Respond,
  adminUsername: string,
): Promise<APIGatewayProxyResult> {
  let body: PutRequestBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { success: false, error: 'Invalid JSON body' });
  }

  if (!Array.isArray(body.items)) {
    return respond(400, { success: false, error: 'items array is required' });
  }

  if (body.items.length > MAX_CURATED_ITEMS) {
    return respond(400, {
      success: false,
      error: `Maximum ${MAX_CURATED_ITEMS} items allowed`,
    });
  }

  // Validate fields synchronously first
  for (let i = 0; i < body.items.length; i++) {
    const entry = body.items[i];
    if (!entry.postId) {
      return respond(400, { success: false, error: `Item ${i}: postId is required` });
    }
    if (!VALID_BADGES.includes(entry.badge)) {
      return respond(400, { success: false, error: `Item ${i}: invalid badge` });
    }
  }

  // Verify all posts exist in parallel
  const postChecks = await Promise.all(
    body.items.map(async (entry, i) => {
      const post = await getPostById(entry.postId);
      return { index: i, exists: !!post };
    })
  );
  const missing = postChecks.find((c) => !c.exists);
  if (missing) {
    return respond(400, { success: false, error: `Item ${missing.index}: post not found` });
  }

  // Normalize order to sequential 1-based
  const normalizedItems: CuratedFeedEntry[] = body.items.map((item, idx) => ({
    postId: item.postId,
    badge: item.badge,
    order: idx + 1,
  }));

  const record = await saveCuratedFeedRecord(normalizedItems, adminUsername);

  return respond(200, {
    success: true,
    items: record.items,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  });
}
