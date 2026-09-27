import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Mirrors apps/pado/frontend/eslint.config.js. gostop was the only frontend
// outside the deploy-script eslint gate added after the 2026-05-27 pado
// universal outage, where a hook below an early return in OrderConfirmModal
// shipped because vite build does not run react-hooks rules.
export default defineConfig([
  // src/archive/ holds removed-feature code kept for reference. Vite
  // tree-shakes it out of prod; its stale violations must not gate deploys.
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
    rules: {
      // CORE — the one rule this gate exists for. Keep at error.
      'react-hooks/rules-of-hooks': 'error',
      // eslint-plugin-react-hooks is pinned to ^5.0.0 to match pado and
      // nasun-website. v7 adds purity / set-state-in-effect rules that would
      // land as a wall of new errors; adopting it is a separate decision.
      'react-hooks/exhaustive-deps': 'warn',
      // Demoted so pre-existing violations do not block deploys. Promote as a
      // cleanup PR clears each one.
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
