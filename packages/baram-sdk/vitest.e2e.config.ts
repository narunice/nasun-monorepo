import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__e2e__/**/*.e2e.ts'],
    testTimeout: 120000, // 2 minutes per test (network latency + AI inference)
    hookTimeout: 60000, // 1 minute for setup/teardown
    sequence: {
      concurrent: false, // Run tests sequentially (state dependencies)
    },
  },
});
