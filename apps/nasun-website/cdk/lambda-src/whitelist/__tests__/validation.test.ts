/**
 * Validation Utility Unit Tests
 */

import {
  validateEthereumAddress,
  validateSignature,
  validateTimestamp,
  validateJoinRequest,
} from '../src/utils/validation';

describe('validateEthereumAddress', () => {
  it('should accept valid Ethereum addresses', () => {
    expect(validateEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(true);
    expect(validateEthereumAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(validateEthereumAddress('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(true);
  });

  it('should reject invalid Ethereum addresses', () => {
    expect(validateEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bE')).toBe(false); // too short
    expect(validateEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1')).toBe(false); // too long
    expect(validateEthereumAddress('742d35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(false); // missing 0x
    expect(validateEthereumAddress('0xGGGG35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(false); // invalid hex
    expect(validateEthereumAddress('')).toBe(false);
  });
});

describe('validateSignature', () => {
  it('should accept valid signatures', () => {
    const validSig = '0x' + 'a'.repeat(130);
    expect(validateSignature(validSig)).toBe(true);
  });

  it('should reject invalid signatures', () => {
    expect(validateSignature('0x' + 'a'.repeat(129))).toBe(false); // too short
    expect(validateSignature('0x' + 'a'.repeat(131))).toBe(false); // too long
    expect(validateSignature('a'.repeat(130))).toBe(false); // missing 0x
    expect(validateSignature('0x' + 'G'.repeat(130))).toBe(false); // invalid hex
    expect(validateSignature('')).toBe(false);
  });
});

describe('validateTimestamp', () => {
  beforeEach(() => {
    // Mock Date.now() to a fixed timestamp
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-18T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should accept current timestamp', () => {
    const now = new Date(Date.now()).toISOString();
    const result = validateTimestamp(now);
    expect(result.valid).toBe(true);
  });

  it('should accept timestamp within 2 minutes', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const result = validateTimestamp(oneMinuteAgo);
    expect(result.valid).toBe(true);
  });

  it('should reject timestamp older than 2 minutes', () => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const result = validateTimestamp(threeMinutesAgo);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('should reject future timestamps beyond clock skew', () => {
    const oneMinuteFuture = new Date(Date.now() + 60 * 1000).toISOString();
    const result = validateTimestamp(oneMinuteFuture);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('future');
  });

  it('should accept timestamp within clock skew tolerance (30s)', () => {
    const tenSecondsFuture = new Date(Date.now() + 10 * 1000).toISOString();
    const result = validateTimestamp(tenSecondsFuture);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid timestamp format', () => {
    const result = validateTimestamp('invalid-timestamp');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid timestamp format');
  });
});

describe('validateJoinRequest', () => {
  const validRequest = {
    walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    signature: '0x' + 'a'.repeat(130),
    message: 'Join Nasun Frontiers Whitelist',
    timestamp: new Date().toISOString(),
  };

  it('should accept valid join request', () => {
    const result = validateJoinRequest(validRequest);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid wallet address', () => {
    const result = validateJoinRequest({
      ...validRequest,
      walletAddress: 'invalid',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('wallet address');
  });

  it('should reject invalid signature', () => {
    const result = validateJoinRequest({
      ...validRequest,
      signature: 'invalid',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('should reject missing message', () => {
    const result = validateJoinRequest({
      ...validRequest,
      message: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('message');
  });

  it('should reject missing timestamp', () => {
    const { timestamp, ...requestWithoutTimestamp } = validRequest;
    const result = validateJoinRequest(requestWithoutTimestamp);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Timestamp is required');
  });
});
