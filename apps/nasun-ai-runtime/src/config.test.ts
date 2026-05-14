/**
 * Tests for config.ts — maskApiKey, loadConfig validation
 *
 * loadConfig reads process.env at call time, so we simply
 * set/delete env vars between calls — no module re-import needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dotenv/config to prevent side-effect .env file loading
vi.mock('dotenv/config', () => ({}));

import { maskApiKey, loadConfig } from './config.js';

describe('maskApiKey', () => {
  it('masks long keys showing first 4 and last 4 chars', () => {
    expect(maskApiKey('gsk_1234567890abcdef')).toBe('gsk_...cdef');
  });

  it('returns *** for short keys (12 chars or less)', () => {
    expect(maskApiKey('shortkey')).toBe('***');
    expect(maskApiKey('exactly12345')).toBe('***');
  });

  it('masks keys exactly 13 chars (boundary)', () => {
    expect(maskApiKey('1234567890abc')).toBe('1234...0abc');
  });

  it('handles empty string', () => {
    expect(maskApiKey('')).toBe('***');
  });

  it('handles single character', () => {
    expect(maskApiKey('x')).toBe('***');
  });
});

describe('loadConfig', () => {
  // Valid 64-char hex key (32 random bytes)
  const TEST_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

  const VALID_ENV: Record<string, string> = {
    AGENT_PRIVATE_KEY: TEST_KEY,
    BARAM_PACKAGE_ID: '0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9',
    BARAM_REGISTRY_ID: '0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833',
    BUDGET_ID: '0xabc123',
    LAMBDA_URL: 'https://example.execute-api.ap-northeast-2.amazonaws.com/prod',
    BARAM_API_KEY: 'test-api-key-1234567890',
    EXECUTOR_ADDRESS: '0xdef456',
  };

  const CONFIG_KEYS = [
    'AGENT_PRIVATE_KEY', 'BARAM_PACKAGE_ID', 'BARAM_REGISTRY_ID',
    'BUDGET_ID', 'LAMBDA_URL', 'BARAM_API_KEY', 'EXECUTOR_ADDRESS',
    'PRESET', 'MODE', 'MODEL', 'INTERVAL_MINUTES', 'PRICE', 'RPC_URL',
    'LLM_API_URL', 'LLM_API_KEY', 'LLM_MODEL',
  ];

  beforeEach(() => {
    for (const key of CONFIG_KEYS) {
      delete process.env[key];
    }
  });

  it('rejects invalid MODE', () => {
    Object.assign(process.env, VALID_ENV, { MODE: 'invalid' });
    expect(() => loadConfig()).toThrow('Invalid MODE: invalid');
  });

  it('defaults MODE to lambda', () => {
    Object.assign(process.env, VALID_ENV);
    const config = loadConfig();
    expect(config.mode).toBe('lambda');
  });

  it('record mode requires LLM_API_URL', () => {
    Object.assign(process.env, VALID_ENV, { MODE: 'record', LLM_API_KEY: 'test' });
    expect(() => loadConfig()).toThrow('LLM_API_URL');
  });

  it('record mode requires LLM_API_KEY', () => {
    Object.assign(process.env, VALID_ENV, {
      MODE: 'record',
      LLM_API_URL: 'https://api.groq.com/openai/v1',
    });
    expect(() => loadConfig()).toThrow('LLM_API_KEY');
  });

  it('record mode rejects non-HTTPS LLM_API_URL', () => {
    Object.assign(process.env, VALID_ENV, {
      MODE: 'record',
      LLM_API_URL: 'http://api.groq.com/openai/v1',
      LLM_API_KEY: 'test',
    });
    expect(() => loadConfig()).toThrow('must use HTTPS');
  });

  it('record mode loads LLM config correctly', () => {
    Object.assign(process.env, VALID_ENV, {
      MODE: 'record',
      LLM_API_URL: 'https://api.groq.com/openai/v1',
      LLM_API_KEY: 'gsk_test_key_1234567890',
      LLM_MODEL: 'mixtral-8x7b-32768',
    });
    const config = loadConfig();
    expect(config.mode).toBe('record');
    expect(config.llmApiUrl).toBe('https://api.groq.com/openai/v1');
    expect(config.llmApiKey).toBe('gsk_test_key_1234567890');
    expect(config.llmModel).toBe('mixtral-8x7b-32768');
  });

  it('record mode defaults LLM_MODEL to llama-3.3-70b-versatile', () => {
    Object.assign(process.env, VALID_ENV, {
      MODE: 'record',
      LLM_API_URL: 'https://api.groq.com/openai/v1',
      LLM_API_KEY: 'gsk_test',
    });
    const config = loadConfig();
    expect(config.llmModel).toBe('llama-3.3-70b-versatile');
  });

  it('lambda mode does not require LLM vars', () => {
    Object.assign(process.env, VALID_ENV, { MODE: 'lambda' });
    const config = loadConfig();
    expect(config.llmApiUrl).toBe('');
    expect(config.llmApiKey).toBe('');
    expect(config.llmModel).toBe('');
  });

  it('enforces minimum interval of 5 minutes', () => {
    Object.assign(process.env, VALID_ENV, { INTERVAL_MINUTES: '2' });
    const config = loadConfig();
    expect(config.intervalMinutes).toBe(5);
  });

  it('rejects invalid PRESET', () => {
    Object.assign(process.env, VALID_ENV, { PRESET: 'nonexistent' });
    expect(() => loadConfig()).toThrow('Invalid PRESET');
  });

  it('rejects non-HTTPS LAMBDA_URL', () => {
    Object.assign(process.env, VALID_ENV, {
      LAMBDA_URL: 'http://insecure.example.com',
    });
    expect(() => loadConfig()).toThrow('must use HTTPS');
  });
});
