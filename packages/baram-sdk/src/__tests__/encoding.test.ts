import { describe, it, expect } from 'vitest';
import { sha256, hexToBytes } from '../services/encoding';

describe('sha256', () => {
  it('hashes empty string correctly', async () => {
    const hash = await sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "hello" correctly', async () => {
    const hash = await sha256('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns 64-character hex string', async () => {
    const hash = await sha256('test prompt');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

describe('hexToBytes', () => {
  it('converts hex to byte array', () => {
    expect(hexToBytes('ff00ab')).toEqual([255, 0, 171]);
  });

  it('converts empty string to empty array', () => {
    expect(hexToBytes('')).toEqual([]);
  });

  it('converts SHA-256 hash to 32-byte array', async () => {
    const hash = await sha256('test');
    const bytes = hexToBytes(hash);
    expect(bytes).toHaveLength(32);
  });
});
