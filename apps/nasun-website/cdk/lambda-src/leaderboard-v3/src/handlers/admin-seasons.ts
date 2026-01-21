/**
 * Admin Seasons Handler
 *
 * CRUD operations for season management.
 * All endpoints require admin authentication.
 *
 * Endpoints:
 * - POST   /v3/admin/seasons              Create season
 * - GET    /v3/admin/seasons              List seasons
 * - GET    /v3/admin/seasons/:seasonId    Get season
 * - PATCH  /v3/admin/seasons/:seasonId    Update season
 * - DELETE /v3/admin/seasons/:seasonId    Delete season (only if no posts)
 * - POST   /v3/admin/seasons/:seasonId/activate   Manually activate
 * - POST   /v3/admin/seasons/:seasonId/end        Manually end
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  Season,
  SeasonStatus,
  CreateSeasonRequest,
  UpdateSeasonRequest,
  DYNAMO_KEYS,
} from '../types';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const POSTS_TABLE =
  process.env.LEADERBOARD_V3_POSTS_TABLE || DYNAMO_KEYS.POSTS_TABLE;
const ADMIN_PASSWORD = process.env.LEADERBOARD_V3_ADMIN_PASSWORD || '';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Username',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function validateAdmin(event: APIGatewayProxyEvent): { valid: boolean; username?: string; error?: string } {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  // Simple password auth: Authorization: Bearer <password>
  const [bearer, password] = authHeader.split(' ');
  if (bearer?.toLowerCase() !== 'bearer' || password !== ADMIN_PASSWORD) {
    return { valid: false, error: 'Invalid credentials' };
  }

  const username = event.headers['X-Admin-Username'] || event.headers['x-admin-username'] || 'admin';
  return { valid: true, username };
}

function validateDateRange(startDate: string, endDate: string): { valid: boolean; error?: string } {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: 'Dates must be in YYYY-MM-DD format' };
  }

  if (startDate >= endDate) {
    return { valid: false, error: 'startDate must be before endDate' };
  }

  return { valid: true };
}

// ============================================
// Season Operations
// ============================================

async function createSeason(request: CreateSeasonRequest, createdBy: string): Promise<Season> {
  const { seasonId, name, description, startDate, endDate } = request;

  // Check if season already exists
  const existing = await docClient.send(
    new GetCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
    })
  );

  if (existing.Item) {
    throw new Error(`Season ${seasonId} already exists`);
  }

  // Check for date overlap with existing seasons
  const allSeasons = await getAllSeasons();
  const overlapping = allSeasons.find(
    (s) =>
      (startDate >= s.startDate && startDate <= s.endDate) ||
      (endDate >= s.startDate && endDate <= s.endDate) ||
      (startDate <= s.startDate && endDate >= s.endDate)
  );

  if (overlapping) {
    throw new Error(`Date range overlaps with season ${overlapping.seasonId}`);
  }

  const now = new Date().toISOString();
  const season: Season = {
    seasonId,
    sk: 'METADATA',
    name,
    description,
    startDate,
    endDate,
    status: 'upcoming',
    isDefault: false,
    totalPosts: 0,
    totalAccounts: 0,
    createdAt: now,
    createdBy,
  };

  await docClient.send(
    new PutCommand({
      TableName: SEASONS_TABLE,
      Item: season,
    })
  );

  return season;
}

async function getAllSeasons(): Promise<Season[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: 'sk = :sk',
      ExpressionAttributeValues: {
        ':sk': 'METADATA',
      },
    })
  );

  return (result.Items || []) as Season[];
}

async function getSeason(seasonId: string): Promise<Season | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
    })
  );

  return (result.Item as Season) || null;
}

async function updateSeason(
  seasonId: string,
  updates: UpdateSeasonRequest,
  updatedBy: string
): Promise<Season> {
  const existing = await getSeason(seasonId);
  if (!existing) {
    throw new Error(`Season ${seasonId} not found`);
  }

  // If updating dates, validate and check for overlap
  if (updates.startDate || updates.endDate) {
    const newStartDate = updates.startDate || existing.startDate;
    const newEndDate = updates.endDate || existing.endDate;

    const dateValidation = validateDateRange(newStartDate, newEndDate);
    if (!dateValidation.valid) {
      throw new Error(dateValidation.error);
    }

    // Check for overlap with other seasons
    const allSeasons = await getAllSeasons();
    const overlapping = allSeasons.find(
      (s) =>
        s.seasonId !== seasonId &&
        ((newStartDate >= s.startDate && newStartDate <= s.endDate) ||
          (newEndDate >= s.startDate && newEndDate <= s.endDate) ||
          (newStartDate <= s.startDate && newEndDate >= s.endDate))
    );

    if (overlapping) {
      throw new Error(`Date range overlaps with season ${overlapping.seasonId}`);
    }
  }

  // Build update expression
  const updateParts: string[] = [];
  const expressionValues: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    updateParts.push('#n = :name');
    expressionValues[':name'] = updates.name;
  }
  if (updates.description !== undefined) {
    updateParts.push('description = :description');
    expressionValues[':description'] = updates.description;
  }
  if (updates.startDate !== undefined) {
    updateParts.push('startDate = :startDate');
    expressionValues[':startDate'] = updates.startDate;
  }
  if (updates.endDate !== undefined) {
    updateParts.push('endDate = :endDate');
    expressionValues[':endDate'] = updates.endDate;
  }
  if (updates.status !== undefined) {
    updateParts.push('#s = :status');
    expressionValues[':status'] = updates.status;
  }
  if (updates.isDefault !== undefined) {
    updateParts.push('isDefault = :isDefault');
    expressionValues[':isDefault'] = updates.isDefault;
  }

  updateParts.push('updatedAt = :updatedAt');
  expressionValues[':updatedAt'] = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: {
        '#n': 'name',
        '#s': 'status',
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Season;
}

async function deleteSeason(seasonId: string): Promise<void> {
  // Check if season has posts
  const postsResult = await docClient.send(
    new QueryCommand({
      TableName: POSTS_TABLE,
      IndexName: DYNAMO_KEYS.POSTS_SEASON_INDEX,
      KeyConditionExpression: 'seasonId = :seasonId',
      ExpressionAttributeValues: {
        ':seasonId': seasonId,
      },
      Limit: 1,
    })
  );

  if (postsResult.Items && postsResult.Items.length > 0) {
    throw new Error(`Cannot delete season ${seasonId}: has existing posts`);
  }

  await docClient.send(
    new DeleteCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
    })
  );
}

async function activateSeason(seasonId: string): Promise<Season> {
  const season = await getSeason(seasonId);
  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  if (season.status === 'ended' || season.status === 'archived') {
    throw new Error(`Cannot activate season with status ${season.status}`);
  }

  // Deactivate current default season
  const allSeasons = await getAllSeasons();
  const currentDefault = allSeasons.find((s) => s.isDefault && s.seasonId !== seasonId);
  if (currentDefault) {
    await docClient.send(
      new UpdateCommand({
        TableName: SEASONS_TABLE,
        Key: { seasonId: currentDefault.seasonId, sk: 'METADATA' },
        UpdateExpression: 'SET isDefault = :isDefault',
        ExpressionAttributeValues: {
          ':isDefault': false,
        },
      })
    );
  }

  // Activate this season
  const result = await docClient.send(
    new UpdateCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
      UpdateExpression: 'SET #s = :status, isDefault = :isDefault, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':status': 'active',
        ':isDefault': true,
        ':updatedAt': new Date().toISOString(),
      },
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Season;
}

async function endSeason(seasonId: string): Promise<Season> {
  const season = await getSeason(seasonId);
  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  if (season.status !== 'active') {
    throw new Error(`Cannot end season with status ${season.status}`);
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
      UpdateExpression: 'SET #s = :status, isDefault = :isDefault, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':status': 'ended',
        ':isDefault': false,
        ':updatedAt': new Date().toISOString(),
      },
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Season;
}

/**
 * Get the currently active season
 */
export async function getActiveSeason(): Promise<Season | null> {
  const allSeasons = await getAllSeasons();
  return allSeasons.find((s) => s.status === 'active') || null;
}

/**
 * Get the default season for public display
 */
export async function getDefaultSeason(): Promise<Season | null> {
  const allSeasons = await getAllSeasons();
  return allSeasons.find((s) => s.isDefault) || null;
}

// ============================================
// Lambda Handler
// ============================================

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Admin Seasons request:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  // Validate admin
  const authResult = validateAdmin(event);
  if (!authResult.valid) {
    return createResponse(401, { error: authResult.error });
  }

  const method = event.httpMethod;
  const pathParams = event.pathParameters || {};
  const seasonId = pathParams.seasonId;
  const action = pathParams.action; // For /activate or /end

  try {
    // POST /v3/admin/seasons - Create season
    if (method === 'POST' && !seasonId) {
      const body = JSON.parse(event.body || '{}') as CreateSeasonRequest;

      if (!body.seasonId || !body.name || !body.startDate || !body.endDate) {
        return createResponse(400, { error: 'Missing required fields: seasonId, name, startDate, endDate' });
      }

      const dateValidation = validateDateRange(body.startDate, body.endDate);
      if (!dateValidation.valid) {
        return createResponse(400, { error: dateValidation.error });
      }

      const season = await createSeason(body, authResult.username!);
      return createResponse(201, { success: true, season });
    }

    // GET /v3/admin/seasons - List all seasons
    if (method === 'GET' && !seasonId) {
      const seasons = await getAllSeasons();
      // Sort by startDate descending
      seasons.sort((a, b) => b.startDate.localeCompare(a.startDate));
      return createResponse(200, { seasons });
    }

    // GET /v3/admin/seasons/:seasonId - Get specific season
    if (method === 'GET' && seasonId && !action) {
      const season = await getSeason(seasonId);
      if (!season) {
        return createResponse(404, { error: `Season ${seasonId} not found` });
      }
      return createResponse(200, { season });
    }

    // PATCH /v3/admin/seasons/:seasonId - Update season
    if (method === 'PATCH' && seasonId) {
      const body = JSON.parse(event.body || '{}') as UpdateSeasonRequest;
      const season = await updateSeason(seasonId, body, authResult.username!);
      return createResponse(200, { success: true, season });
    }

    // DELETE /v3/admin/seasons/:seasonId - Delete season
    if (method === 'DELETE' && seasonId) {
      await deleteSeason(seasonId);
      return createResponse(200, { success: true, message: `Season ${seasonId} deleted` });
    }

    // POST /v3/admin/seasons/:seasonId/activate - Manually activate
    if (method === 'POST' && seasonId && action === 'activate') {
      const season = await activateSeason(seasonId);
      return createResponse(200, { success: true, season });
    }

    // POST /v3/admin/seasons/:seasonId/end - Manually end
    if (method === 'POST' && seasonId && action === 'end') {
      const season = await endSeason(seasonId);
      return createResponse(200, { success: true, season });
    }

    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Admin Seasons error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { error: message });
  }
};
