import { describe, it, expect } from 'vitest';
import {
  parseAERFields,
  parseOptionString,
  parseOptionNumber,
  parseOptionBytes,
  parseFeeDetail,
  parseModelMetadata,
  parseConstraints,
} from '../services/parse';

// Minimal Move-like fields for a complete AERRecord
function makeFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    request_id: '42',
    initiator: '0xabc',
    authorizer: '0xabc',
    delegation_path: [],
    executor: '0xdef',
    executor_principal: null,
    payment_amount: '5000000',
    payment_token: '0',
    executor_received: '4500000',
    fee_detail: null,
    budget_id: null,
    budget_remaining: null,
    model_name: 'gpt-4o',
    model_metadata: null,
    input_hash: [0xab, 0xcd],
    output_hash: [0x12, 0x34],
    execution_time_ms: '1500',
    purpose: null,
    policy_version: null,
    constraints: null,
    executor_tier: '2',
    executor_reputation: '850',
    executor_stake_amount: '1000000000',
    tee_verified: true,
    tee_attestation_hash: [0xff, 0xee],
    requested_at: '1700000000000',
    settled_at: '1700000001500',
    status: '0',
    triggered_by: null,
    triggered_action: null,
    ...overrides,
  };
}

describe('parseAERFields', () => {
  it('should parse minimal fields into a complete AERRecord', () => {
    const record = parseAERFields(makeFields(), '0xrecord1');

    expect(record.objectId).toBe('0xrecord1');
    expect(record.requestId).toBe(42);
    expect(record.initiator).toBe('0xabc');
    expect(record.executor).toBe('0xdef');
    expect(record.paymentAmount).toBe(5000000);
    expect(record.paymentToken).toBe(0);
    expect(record.executorReceived).toBe(4500000);
    expect(record.modelName).toBe('gpt-4o');
    expect(record.inputHash).toBe('abcd');
    expect(record.outputHash).toBe('1234');
    expect(record.executionTimeMs).toBe(1500);
    expect(record.executorTier).toBe(2);
    expect(record.executorTierName).toBe('Silver');
    expect(record.executorReputation).toBe(850);
    expect(record.teeVerified).toBe(true);
    expect(record.teeAttestationHash).toBe('ffee');
    expect(record.status).toBe(0);
    expect(record.statusName).toBe('Settled');
  });

  it('should clamp executor tier to max 3', () => {
    const record = parseAERFields(makeFields({ executor_tier: '99' }), '0x1');
    expect(record.executorTier).toBe(3);
    expect(record.executorTierName).toBe('Gold');
  });

  it('should parse delegation_path as string array', () => {
    const record = parseAERFields(
      makeFields({ delegation_path: ['0xowner', '0xagent'] }),
      '0x1',
    );
    expect(record.delegationPath).toEqual(['0xowner', '0xagent']);
  });

  it('should handle missing delegation_path gracefully', () => {
    const record = parseAERFields(makeFields({ delegation_path: undefined }), '0x1');
    expect(record.delegationPath).toEqual([]);
  });

  it('should parse Option fields as null when absent', () => {
    const record = parseAERFields(makeFields(), '0x1');
    expect(record.executorPrincipal).toBeNull();
    expect(record.budgetId).toBeNull();
    expect(record.budgetRemaining).toBeNull();
    expect(record.purpose).toBeNull();
    expect(record.policyVersion).toBeNull();
    expect(record.triggeredBy).toBeNull();
    expect(record.triggeredAction).toBeNull();
  });

  it('should parse Option fields when present', () => {
    const record = parseAERFields(
      makeFields({
        executor_principal: '0xprincipal',
        budget_id: '0xbudget',
        budget_remaining: '1000000',
        purpose: 'image generation',
        policy_version: '3',
        triggered_by: '0xparent',
        triggered_action: 'chain_inference',
      }),
      '0x1',
    );
    expect(record.executorPrincipal).toBe('0xprincipal');
    expect(record.budgetId).toBe('0xbudget');
    expect(record.budgetRemaining).toBe(1000000);
    expect(record.purpose).toBe('image generation');
    expect(record.policyVersion).toBe(3);
    expect(record.triggeredBy).toBe('0xparent');
    expect(record.triggeredAction).toBe('chain_inference');
  });

  it('should parse JSON fee_detail into typed FeeDetail', () => {
    const feeJson = JSON.stringify({
      modelCreator: 100000,
      royalty: 50000,
      protocolFee: 350000,
    });
    const record = parseAERFields(makeFields({ fee_detail: feeJson }), '0x1');
    expect(record.feeDetail).toEqual({
      modelCreator: 100000,
      royalty: 50000,
      protocolFee: 350000,
    });
  });

  it('should parse JSON model_metadata into typed ModelMetadata', () => {
    const metaJson = JSON.stringify({
      provider: 'openai',
      version: 'gpt-4o-2024-05-13',
      hash: 'abc123',
      parameters: { top_p: 0.9 },
    });
    const record = parseAERFields(makeFields({ model_metadata: metaJson }), '0x1');
    expect(record.modelMetadata).toEqual({
      provider: 'openai',
      version: 'gpt-4o-2024-05-13',
      hash: 'abc123',
      parameters: { top_p: 0.9 },
    });
  });

  it('should parse JSON constraints into typed ExecutionConstraints', () => {
    const constraintsJson = JSON.stringify({
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 30000,
    });
    const record = parseAERFields(makeFields({ constraints: constraintsJson }), '0x1');
    expect(record.constraints).toEqual({
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 30000,
    });
  });

  it('should return null for malformed JSON fields', () => {
    const record = parseAERFields(
      makeFields({
        fee_detail: 'not-json',
        model_metadata: '{bad',
        constraints: '123',
      }),
      '0x1',
    );
    expect(record.feeDetail).toBeNull();
    expect(record.modelMetadata).toBeNull();
    // '123' parses to a number, not an object → null
    expect(record.constraints).toBeNull();
  });

  it('should handle string-typed input_hash (already hex)', () => {
    const record = parseAERFields(
      makeFields({ input_hash: 'deadbeef', output_hash: 'cafebabe' }),
      '0x1',
    );
    expect(record.inputHash).toBe('deadbeef');
    expect(record.outputHash).toBe('cafebabe');
  });
});

describe('parseOptionString', () => {
  it('returns null for null/undefined', () => {
    expect(parseOptionString(null)).toBeNull();
    expect(parseOptionString(undefined)).toBeNull();
  });
  it('converts non-null to string', () => {
    expect(parseOptionString('hello')).toBe('hello');
    expect(parseOptionString(42)).toBe('42');
  });
});

describe('parseOptionNumber', () => {
  it('returns null for null/undefined', () => {
    expect(parseOptionNumber(null)).toBeNull();
    expect(parseOptionNumber(undefined)).toBeNull();
  });
  it('converts non-null to number', () => {
    expect(parseOptionNumber('123')).toBe(123);
    expect(parseOptionNumber(0)).toBe(0);
  });
});

describe('parseOptionBytes', () => {
  it('returns null for null/undefined', () => {
    expect(parseOptionBytes(null)).toBeNull();
    expect(parseOptionBytes(undefined)).toBeNull();
  });
  it('converts byte array to hex string', () => {
    expect(parseOptionBytes([0xff, 0x00, 0xab])).toBe('ff00ab');
  });
  it('passes through string values', () => {
    expect(parseOptionBytes('existing_hex')).toBe('existing_hex');
  });
  it('returns null for unexpected types', () => {
    expect(parseOptionBytes(42)).toBeNull();
    expect(parseOptionBytes({ key: 'value' })).toBeNull();
    expect(parseOptionBytes(true)).toBeNull();
  });
});

describe('parseFeeDetail', () => {
  it('returns null for null input', () => {
    expect(parseFeeDetail(null)).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseFeeDetail('')).toBeNull();
  });
  it('returns null for non-object JSON', () => {
    expect(parseFeeDetail('"hello"')).toBeNull();
    expect(parseFeeDetail('42')).toBeNull();
  });
  it('parses valid fee detail', () => {
    const result = parseFeeDetail('{"modelCreator":100,"royalty":50}');
    expect(result).toEqual({ modelCreator: 100, royalty: 50 });
  });
  it('ignores non-number fields', () => {
    const result = parseFeeDetail('{"modelCreator":"not_a_number"}');
    expect(result).toEqual({});
  });
});

describe('parseModelMetadata', () => {
  it('returns null for null input', () => {
    expect(parseModelMetadata(null)).toBeNull();
  });
  it('parses valid metadata', () => {
    const result = parseModelMetadata('{"provider":"anthropic","version":"claude-3"}');
    expect(result).toEqual({ provider: 'anthropic', version: 'claude-3' });
  });
  it('ignores non-string provider/version', () => {
    const result = parseModelMetadata('{"provider":123}');
    expect(result).toEqual({});
  });
});

describe('parseConstraints', () => {
  it('returns null for null input', () => {
    expect(parseConstraints(null)).toBeNull();
  });
  it('parses valid constraints with extra fields', () => {
    const result = parseConstraints('{"maxTokens":1024,"customField":"ok"}');
    expect(result).toEqual({ maxTokens: 1024, customField: 'ok' });
  });
  it('returns null for non-object JSON', () => {
    expect(parseConstraints('[1,2,3]')).toBeNull(); // arrays rejected
    expect(parseConstraints('null')).toBeNull();
  });
  it('strips prototype pollution keys', () => {
    const result = parseConstraints('{"maxTokens":1024,"__proto__":{"polluted":true},"constructor":{"bad":true}}');
    expect(result).toEqual({ maxTokens: 1024 });
  });
});
