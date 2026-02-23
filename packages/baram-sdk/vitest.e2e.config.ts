import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__e2e__/**/*.e2e.ts'],
    testTimeout: 30000, // 30s per test (read-only, no AI inference)
    hookTimeout: 15000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
