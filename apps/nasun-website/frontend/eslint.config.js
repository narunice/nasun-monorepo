import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // 2026-05-27: _archive/ holds decommissioned-feature code (e.g. creator-reward)
  // kept for reference. Not in tsconfig.app.json project so parserOptions.project
  // can't load it — ignoring also avoids "file not found in project" parse error
  // that blocks the whole lint run.
  { ignores: ["dist", "src/_archive/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json", "./tsconfig.node.json"],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // 2026-05-27: pre-existing prod violations would block the new
      // deploy-script eslint gate. Keep react-hooks/rules-of-hooks at
      // error — that class caused the 5/27 pado universal outage
      // (OrderConfirmModal hook below early return). Demote noisier rules
      // until a cleanup PR clears the existing violations.
      // CORE — re-promote only after cleanup PR.
      "react-hooks/rules-of-hooks": "error",
      // Installed eslint-plugin-react-hooks is v5 (only rules-of-hooks +
      // exhaustive-deps). v6 rules are referenced via doc only; do not list
      // them here or ESLint throws "Could not find rule".
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-empty-static-block": "warn",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  }
);
