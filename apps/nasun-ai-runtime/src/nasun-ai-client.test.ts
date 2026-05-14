/**
 * Tests for nasun-ai-client.ts — sha256, sha256Hex, categorizeError
 */

import { describe, it, expect, vi } from 'vitest';
import { sha256, sha256Hex, categorizeError, isPendingActive } from './nasun-ai-client.js';
import type { SuiClient } from '@mysten/sui/client';

describe('sha256', () => {
  it('returns Uint8Array of 32 bytes', () => {
    const result = sha256('hello');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(32);
  });

  it('produces deterministic output', () => {
    const a = sha256('test');
    const b = sha256('test');
    expect(a).toEqual(b);
  });

  it('produces different output for different inputs', () => {
    const a = sha256('input1');
    const b = sha256('input2');
    expect(a).not.toEqual(b);
  });

  it('handles empty string', () => {
    const result = sha256('');
    expect(result.length).toBe(32);
  });

  it('handles unicode characters', () => {
    const result = sha256('AI 규제 동향 분석');
    expect(result.length).toBe(32);
  });
});

describe('sha256Hex', () => {
  it('returns 64-character hex string', () => {
    const result = sha256Hex('hello');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches known SHA-256 hash for "hello"', () => {
    // SHA-256 of "hello" is well-known
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('produces consistent output with sha256 (same bytes)', () => {
    const input = 'test input';
    const bytes = sha256(input);
    const hex = sha256Hex(input);
    // Convert bytes to hex and compare
    const bytesHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(bytesHex);
  });

  it('handles empty string', () => {
    const result = sha256Hex('');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    // SHA-256 of "" is well-known
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is always lowercase hex', () => {
    const result = sha256Hex('anything');
    expect(result).toBe(result.toLowerCase());
  });
});

describe('categorizeError', () => {
  it('identifies budget inactive error as fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 103) in command 0');
    expect(result.code).toBe('103');
    expect(result.fatal).toBe(true);
    expect(result.message).toContain('inactive');
  });

  it('identifies insufficient balance as non-fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 104) in command 0');
    expect(result.code).toBe('104');
    expect(result.fatal).toBe(false);
  });

  it('identifies rate limit as non-fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 115) in command 0');
    expect(result.code).toBe('115');
    expect(result.fatal).toBe(false);
    expect(result.message).toContain('Rate limited');
  });

  it('identifies not authorized agent as fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 101) in command 0');
    expect(result.code).toBe('101');
    expect(result.fatal).toBe(true);
  });

  it('identifies daily limit exceeded as non-fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 112) in command 0');
    expect(result.code).toBe('112');
    expect(result.fatal).toBe(false);
  });

  it('identifies weekly limit exceeded as non-fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 113) in command 0');
    expect(result.code).toBe('113');
    expect(result.fatal).toBe(false);
  });

  it('identifies monthly limit exceeded as non-fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 114) in command 0');
    expect(result.code).toBe('114');
    expect(result.fatal).toBe(false);
  });

  it('identifies budget expired as fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 102) in command 0');
    expect(result.code).toBe('102');
    expect(result.fatal).toBe(true);
  });

  it('identifies category not allowed as fatal', () => {
    const result = categorizeError('MoveAbort(MoveLocation ..., 111) in command 0');
    expect(result.code).toBe('111');
    expect(result.fatal).toBe(true);
  });

  it('returns original error for unknown codes', () => {
    const msg = 'Some unknown error message';
    const result = categorizeError(msg);
    expect(result.code).toBe('');
    expect(result.fatal).toBe(false);
    expect(result.message).toBe(msg);
  });

  it('handles error strings without abort codes', () => {
    const result = categorizeError('Connection refused ECONNREFUSED');
    expect(result.code).toBe('');
    expect(result.fatal).toBe(false);
  });
});

describe('isPendingActive (devInspect view)', () => {
  const SENDER = '0x' + 'a'.repeat(64);
  const CAP_ID = '0x' + 'b'.repeat(64);
  const AER_PKG = '0x' + 'c'.repeat(64);

  function clientReturning(bcsByte: number): Pick<SuiClient, 'devInspectTransactionBlock'> {
    return {
      devInspectTransactionBlock: vi.fn().mockResolvedValue({
        results: [{ returnValues: [[[bcsByte], 'bool']] }],
      }),
    } as unknown as Pick<SuiClient, 'devInspectTransactionBlock'>;
  }

  it('returns false when aerPackageId is empty (legacy capability)', async () => {
    const result = await isPendingActive(
      {} as unknown as SuiClient,
      '',
      CAP_ID,
      Date.now(),
      SENDER,
    );
    expect(result).toBe(false);
  });

  it('parses bcs bool true', async () => {
    const client = clientReturning(1);
    const result = await isPendingActive(
      client as SuiClient,
      AER_PKG,
      CAP_ID,
      Date.now(),
      SENDER,
    );
    expect(result).toBe(true);
  });

  it('parses bcs bool false', async () => {
    const client = clientReturning(0);
    const result = await isPendingActive(
      client as SuiClient,
      AER_PKG,
      CAP_ID,
      Date.now(),
      SENDER,
    );
    expect(result).toBe(false);
  });

  it('throws when devInspect returns no values', async () => {
    const client = {
      devInspectTransactionBlock: vi.fn().mockResolvedValue({ results: [{ returnValues: [] }] }),
    } as unknown as SuiClient;
    await expect(
      isPendingActive(client, AER_PKG, CAP_ID, Date.now(), SENDER),
    ).rejects.toThrow(/no values/);
  });
});
