import { describe, it, expect } from 'vitest';
import { createDevnetConfig } from '../config';

describe('createDevnetConfig', () => {
  it('returns a config with all required fields', () => {
    const config = createDevnetConfig();

    expect(config.rpcUrl).toBeTruthy();
    expect(config.rpcUrl).toContain('nasun.io');

    expect(config.baram.packageId).toMatch(/^0x[a-f0-9]+$/);
    expect(config.baram.registryId).toMatch(/^0x[a-f0-9]+$/);

    expect(config.executor.packageId).toMatch(/^0x[a-f0-9]+$/);
    expect(config.executor.registryId).toMatch(/^0x[a-f0-9]+$/);
    expect(config.executor.processedRequestsId).toMatch(/^0x[a-f0-9]+$/);
    expect(config.executor.tierRegistryId).toMatch(/^0x[a-f0-9]+$/);

    expect(config.aer.packageId).toMatch(/^0x[a-f0-9]+$/);
    expect(config.aer.registryId).toMatch(/^0x[a-f0-9]+$/);

    expect(config.tokens.nusdcType).toBeTruthy();
  });

  it('baram and executor have different package IDs', () => {
    const config = createDevnetConfig();
    expect(config.baram.packageId).not.toBe(config.executor.packageId);
  });
});
