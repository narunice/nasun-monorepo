import { defineConfig } from 'vitest/config';

// Stub the env vars that src/env.ts marks as required so the module loads
// cleanly when tests import it transitively. These values never reach a real
// network: tests must not touch postgres/sui/redis from this process.
process.env.GOSTOP_DATABASE_URL ??= 'postgres://test@localhost:5432/test';
process.env.SUI_RPC_URL ??= 'http://localhost:9000';
process.env.AUTH_JWT_SECRET ??= 'vitest-secret-not-for-prod';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
