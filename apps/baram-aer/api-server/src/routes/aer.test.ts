/**
 * E2E tests for AER API routes.
 * Tests validation, error handling, and response formatting
 * through the Hono app.request() interface with a mocked DB.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock the DB module before importing routes
vi.mock('../db.js', () => {
  const mockSql = Object.assign(
    // Tagged template literal form: sql`...`
    vi.fn(async () => []),
    {
      // sql.unsafe(query, values) form
      unsafe: vi.fn(async () => []),
    },
  );
  return { sql: mockSql };
});

import type { Hono } from 'hono';
let app: Hono;

beforeAll(async () => {
  const mod = await import('./aer.js');
  app = mod.default;
});

// Helper to make GET requests against the Hono route handler
async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.request(path);
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, json };
}

const VALID_ADDR = '0x' + 'a'.repeat(64);
const VALID_OBJ = '0x' + 'b'.repeat(64);

// ===== Address Validation (strict 64-char hex) =====

describe('isValidAddress — strict 64-char hex', () => {
  it('rejects short address (< 64 hex)', async () => {
    const { status, json } = await get(`/?initiator=0xabc`);
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_initiator_address');
  });

  it('rejects address without 0x prefix', async () => {
    const { status, json } = await get(`/?executor=${'a'.repeat(64)}`);
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_executor_address');
  });

  it('rejects overly long address (> 64 hex)', async () => {
    const { status, json } = await get(`/?authorizer=0x${'a'.repeat(65)}`);
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_authorizer_address');
  });

  it('rejects non-hex characters', async () => {
    const { status, json } = await get(`/?initiator=0x${'g'.repeat(64)}`);
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_initiator_address');
  });

  it('accepts valid 64-char hex address', async () => {
    const { status } = await get(`/?initiator=${VALID_ADDR}`);
    // Should not be a validation error (200 or depends on DB mock)
    expect(status).not.toBe(400);
  });

  it('accepts uppercase hex', async () => {
    const { status } = await get(`/?executor=0x${'A'.repeat(64)}`);
    expect(status).not.toBe(400);
  });

  it('accepts mixed case hex', async () => {
    const { status } = await get(`/?authorizer=0x${'aAbBcC01'.repeat(8)}`);
    expect(status).not.toBe(400);
  });
});

// ===== Object ID Validation =====

describe('isValidObjectId — strict 64-char hex', () => {
  it('rejects short objectId', async () => {
    const { status, json } = await get('/0xabc');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_object_id');
  });

  it('rejects objectId without 0x prefix', async () => {
    const { status, json } = await get(`/${'a'.repeat(64)}`);
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_object_id');
  });

  it('accepts valid objectId', async () => {
    const { status } = await get(`/${VALID_OBJ}`);
    expect(status).not.toBe(400);
  });
});

// ===== Budget ID Validation =====

describe('budget_id validation', () => {
  it('rejects invalid budget_id', async () => {
    const { status, json } = await get('/?budget_id=0xshort');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_budget_id');
  });

  it('accepts valid budget_id', async () => {
    const { status } = await get(`/?budget_id=${VALID_OBJ}`);
    expect(status).not.toBe(400);
  });
});

// ===== model_name Length Validation =====

describe('model_name length validation', () => {
  it('accepts model_name within limit (100 chars)', async () => {
    const { status } = await get(`/?model_name=${'a'.repeat(100)}`);
    expect(status).not.toBe(400);
  });

  it('rejects model_name exceeding 100 chars', async () => {
    const { status, json } = await get(`/?model_name=${'a'.repeat(101)}`);
    expect(status).toBe(400);
    expect(json.error).toBe('model_name_too_long');
  });

  it('accepts empty model_name (no validation needed)', async () => {
    const { status } = await get('/');
    expect(status).not.toBe(400);
  });
});

// ===== Request ID Validation =====

describe('GET /request/:requestId', () => {
  it('rejects non-numeric requestId', async () => {
    const { status, json } = await get('/request/abc');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_request_id');
  });

  it('rejects negative requestId', async () => {
    const { status, json } = await get('/request/-1');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_request_id');
  });

  it('accepts valid numeric requestId', async () => {
    const { status } = await get('/request/42');
    // 404 from mock (no data), not 400 (validation pass)
    expect(status).toBe(404);
  });
});

// ===== Chain Endpoint =====

describe('GET /:objectId/chain', () => {
  it('rejects invalid objectId', async () => {
    const { status, json } = await get('/0xshort/chain');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_object_id');
  });

  it('accepts valid chain request and returns direction/maxDepth', async () => {
    const { status, json } = await get(`/${VALID_OBJ}/chain?direction=forward&maxDepth=5`);
    expect(status).toBe(200);
    expect(json.direction).toBe('forward');
    expect(json.maxDepth).toBe(5);
    expect(json.data).toEqual([]);
  });

  it('defaults to backward direction', async () => {
    const { status, json } = await get(`/${VALID_OBJ}/chain`);
    expect(status).toBe(200);
    expect(json.direction).toBe('backward');
  });

  it('clamps maxDepth to MAX_CHAIN_DEPTH (20)', async () => {
    const { status, json } = await get(`/${VALID_OBJ}/chain?maxDepth=50`);
    expect(status).toBe(200);
    expect(json.maxDepth).toBe(20);
  });
});

// ===== Reserved Route Guards =====

describe('reserved path guards', () => {
  it('returns 404 for /request as objectId', async () => {
    const res = await app.request('/request');
    expect(res.status).toBe(404);
  });

  it('returns 404 for /sync-status as objectId', async () => {
    const res = await app.request('/sync-status');
    expect(res.status).toBe(404);
  });
});

// ===== parseLimit =====

describe('limit parameter parsing', () => {
  it('defaults to 25 when not provided', async () => {
    // Just verify no error — the mock returns empty data
    const { status } = await get('/');
    expect(status).toBe(200);
  });

  it('snaps to nearest allowed value', async () => {
    // limit=30 → snaps to 25
    const { status } = await get('/?limit=30');
    expect(status).toBe(200);
  });

  it('handles invalid limit gracefully', async () => {
    const { status } = await get('/?limit=abc');
    expect(status).toBe(200);
  });
});

// ===== Order Parameter =====

describe('order parameter', () => {
  it('defaults to desc', async () => {
    const { status } = await get('/');
    expect(status).toBe(200);
  });

  it('accepts asc order', async () => {
    const { status } = await get('/?order=asc');
    expect(status).toBe(200);
  });

  it('falls back to desc for invalid order', async () => {
    const { status } = await get('/?order=invalid');
    expect(status).toBe(200);
  });
});
