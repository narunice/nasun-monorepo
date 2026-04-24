import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // @walletconnect/* ships a mix of ESM and CJS; when vitest loads them
    // through native Node ESM, named imports like `getLoggerContext` from
    // the CJS-only `@walletconnect/logger` blow up. Force vitest to process
    // them through Vite so the CJS→ESM interop works like it does in app
    // bundlers.
    server: {
      deps: {
        inline: [/@walletconnect\//],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/__tests__/**'],
      reporter: ['text', 'json', 'html'],
    },
  },
});
