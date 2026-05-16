/**
 * Tests for Lambda executor index.ts -- handleRecord, classifyError, input validation, maskSensitive
 *
 * Tests extracted pure functions and route-level validation.
 * On-chain calls (verifyRequest, submitProofWithAER) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external modules before importing the handler
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class MockSecretsManagerClient {
    send = vi.fn().mockResolvedValue({
      SecretString: JSON.stringify({ privateKey: 'mock-key' }),
    });
  },
  GetSecretValueCommand: class MockGetSecretValueCommand {
    constructor(public input: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class MockSSMClient {
    send = vi.fn().mockResolvedValue({
      Parameter: { Value: 'mock-groq-key' },
    });
  },
  GetParameterCommand: class MockGetParameterCommand {
    constructor(public input: Record<string, unknown>) {}
  },
}));

vi.mock('./services/ai', () => ({
  initGroq: vi.fn(),
  generateCompletion: vi.fn(),
  isValidModel: vi.fn().mockReturnValue(true),
  getSupportedModels: vi.fn().mockReturnValue(['llama-3.3-70b-versatile']),
}));

vi.mock('./services/sui', () => ({
  initSui: vi.fn(),
  verifyRequest: vi.fn().mockResolvedValue({
    valid: true,
    request: {
      requester: '0xrequester',
      executor: '0xexecutor',
      model: 'test-model',
      promptHash: 'a'.repeat(64),
      status: 0,
      paymentAmount: 1000000,
    },
  }),
  submitProofWithAER: vi.fn().mockResolvedValue('mock-tx-digest'),
  getExecutorAddress: vi.fn().mockReturnValue('0xexecutor'),
  getExecutorStats: vi.fn().mockResolvedValue({
    tier: 1,
    reputation: 500,
    stakeAmount: 1000000000,
  }),
}));

import { handler } from './index';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { verifyRequest, submitProofWithAER } from './services/sui';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/record',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    ...overrides,
  };
}

const mockContext = {} as Context;
const mockCallback = vi.fn();

// Global beforeEach to clear mock call history between all tests
beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /record -- route-level validation', () => {

  it('rejects missing body', async () => {
    const event = makeEvent({ path: '/record', body: null });
    const result = await handler(event, mockContext, mockCallback);
    expect(result).toBeTruthy();
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('body is required');
  });

  it('rejects invalid JSON', async () => {
    const event = makeEvent({ path: '/record', body: 'not-json{{{' });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('Invalid JSON');
  });

  it('rejects missing requestId', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('requestId');
  });

  it('rejects negative requestId', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: -1,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('requestId');
  });

  it('rejects float requestId', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 3.14,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
  });

  it('rejects string requestId', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: '42',
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
  });

  it('rejects missing result', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('result');
  });

  it('rejects non-string result', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 12345,
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
  });

  it('rejects missing promptHash', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('promptHash');
  });
});

describe('handleRecord -- result length validation', () => {
  it('rejects result shorter than 50 chars', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(49),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    // handleRecord throws → classifyError maps to 400
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('50');
  });

  it('accepts result exactly 50 chars', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(50),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.txDigest).toBe('mock-tx-digest');
  });

  it('accepts result exactly 10,000 chars', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(10_000),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);
  });

  it('rejects result over 10,000 chars', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(10_001),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('10,000');
  });
});

describe('handleRecord -- promptHash validation', () => {
  it('rejects promptHash shorter than 64 chars', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(63),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('SHA-256');
  });

  it('rejects promptHash longer than 64 chars', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(65),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
  });

  it('rejects promptHash with non-hex characters', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'g'.repeat(64), // 'g' is not hex
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
  });

  it('accepts uppercase hex promptHash', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'A'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    // /i flag allows uppercase
    expect(response.statusCode).toBe(200);
  });
});

describe('handleRecord -- executionTimeMs validation', () => {
  it('defaults executionTimeMs to 0 when omitted', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
        // executionTimeMs omitted
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);
  });

  it('rejects negative executionTimeMs', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
        executionTimeMs: -100,
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('executionTimeMs');
  });

  it('rejects NaN executionTimeMs', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
        executionTimeMs: NaN,
      }),
    });
    // NaN serializes to null in JSON. Destructuring default (= 0) only
    // applies for undefined, NOT null. !Number.isFinite(null) === true → 400
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('executionTimeMs');
  });

  it('accepts valid executionTimeMs', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
        executionTimeMs: 1500,
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);
  });
});

describe('handleRecord -- on-chain verification failure', () => {
  it('returns failure when request verification fails', async () => {
    vi.mocked(verifyRequest).mockResolvedValueOnce({
      valid: false,
      error: 'Request not found',
    });

    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 999,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('not found');
  });

  it('returns 409 when settlement throws "already completed"', async () => {
    vi.mocked(submitProofWithAER).mockRejectedValueOnce(
      new Error('already completed')
    );

    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    // classifyError maps "already completed" to 409, now propagated as HTTP status
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

describe('handleRecord -- successful settlement', () => {
  it('returns resultHash and txDigest on success', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
        executionTimeMs: 2000,
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe(42);
    expect(body.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.txDigest).toBe('mock-tx-digest');
  });

  it('sets purpose to self_reported in AER data', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    await handler(event, mockContext, mockCallback);

    // Verify submitProofWithAER was called with correct AER data
    expect(submitProofWithAER).toHaveBeenCalledOnce();
    const aerData = vi.mocked(submitProofWithAER).mock.calls[0][4];
    expect(aerData.purpose).toBe('self_reported');
    expect(aerData.teeVerified).toBe(false);
  });
});

describe('classifyError -- via thrown errors', () => {
  it('maps "Result too short" to 400', async () => {
    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(30), // too short
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('50');
  });

  it('maps "status is not PENDING" to 409 via settlement failure', async () => {
    vi.mocked(submitProofWithAER).mockRejectedValueOnce(
      new Error('status is not PENDING')
    );

    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('already been completed');
  });

  it('maps gas errors to 503', async () => {
    vi.mocked(submitProofWithAER).mockRejectedValueOnce(
      new Error('No valid gas coins')
    );

    const event = makeEvent({
      path: '/record',
      body: JSON.stringify({
        requestId: 42,
        result: 'x'.repeat(100),
        promptHash: 'a'.repeat(64),
      }),
    });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('insufficient gas');
  });
});

describe('POST /record -- 404 for wrong method/path', () => {
  it('returns 404 for GET /record', async () => {
    const event = makeEvent({ httpMethod: 'GET', path: '/record' });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for POST /unknown', async () => {
    const event = makeEvent({ path: '/unknown', body: '{}' });
    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(404);
  });
});

describe('CORS', () => {
  it('returns CORS headers for OPTIONS', async () => {
    const event = makeEvent({
      httpMethod: 'OPTIONS',
      path: '/record',
      headers: { origin: 'https://baram.nasun.io' },
    });

    // Set CORS env before importing
    process.env.CORS_ALLOWED_ORIGINS = 'https://baram.nasun.io,https://localhost:5176';

    const result = await handler(event, mockContext, mockCallback);
    const response = result as { statusCode: number; headers?: Record<string, string> };
    expect(response.statusCode).toBe(200);
    expect(response.headers?.['Access-Control-Allow-Methods']).toContain('POST');
  });
});
