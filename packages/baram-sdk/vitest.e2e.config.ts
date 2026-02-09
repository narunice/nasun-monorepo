import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__e2e__/**/*.e2e.ts'],
    testTimeout: 120000, // 2 minutes per test (network latency + AI inference)
    hookTimeout: 60000, // 1 minute for setup/teardown
    fileParallelism: false, // Run test files sequentially (shared wallet coins)
    sequence: {
      concurrent: false, // Run tests within a file sequentially
    },
  },
});
