import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env for API URLs and RPC endpoint
config({ path: resolve(__dirname, '../.env') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: resolve(__dirname),
    include: ['*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    reporters: ['verbose'],
    // Run test files one at a time to avoid overwhelming the API server
    fileParallelism: false,
    sequence: {
      sequential: true,
    },
  },
});
