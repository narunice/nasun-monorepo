import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    // admin tests are in z-admin.e2e.ts to run last (alphabetical order)
  },
});
