import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load frontend .env.development for API URLs
config({ path: resolve(__dirname, '../frontend/.env.development') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: resolve(__dirname),
    include: ['*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    reporters: ['verbose'],
    sequence: {
      sequential: true,
    },
  },
});
