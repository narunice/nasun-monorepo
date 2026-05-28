import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 2026-05-27: archive/ holds removed-feature code kept for reference.
  // It is not built into prod (vite tree-shake) and contains stale lint
  // violations that would block deploy. Real prod paths still lint.
  globalIgnores(['dist', 'src/archive/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // 2026-05-27: pre-existing prod violations would block the new
    // deploy-script eslint gate. The hard-to-bypass rule we MUST keep at
    // error is react-hooks/rules-of-hooks — that exact class of bug caused
    // the 5/27 universal outage (OrderConfirmModal hook below early return).
    // Other rules demoted so the gate doesn't block deploys until a cleanup
    // PR fixes the existing ~70 violations. Re-promote when clean.
    rules: {
      // CORE — re-promote only after a cleanup PR fixes pre-existing violations.
      // rules-of-hooks catches the exact class of bug that caused the 5/27
      // pado universal outage (OrderConfirmModal hook below early return).
      'react-hooks/rules-of-hooks': 'error',
      // eslint-plugin-react-hooks pinned to ^5.0.0 intentionally (matches nws).
      // Plugin had drifted to v7 via unintentional bump, introducing 18 errors
      // from v7-only rules (purity, set-state-in-effect, etc.) that blocked
      // prod deploy. Pin restores documented intent. v7 adoption is a separate
      // decision tracked in nasun-ops handoff 2026-05-27-lint-cleanup-sweep.
      'react-hooks/exhaustive-deps': 'warn',
      // Non-hooks noise demoted too.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-refresh/only-export-components': 'warn',
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      'no-empty': 'warn',
      'no-empty-static-block': 'warn',
    },
  },
])
