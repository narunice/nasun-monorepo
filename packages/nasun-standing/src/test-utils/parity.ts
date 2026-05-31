/**
 * Source-parity utilities for `packages/nasun-tier/sources/policy.move`.
 *
 * Isolated entrypoint — imports `node:fs` and `node:path`. Importing from
 * here in a Vite-bundled app will pull node built-ins into the client bundle
 * and break the build, so production code must only `import` from
 * `@nasun/standing` (the main entry).
 *
 * The parity strategy reads a JSON_ANCHOR comment block at the bottom of
 * `policy.move`. The anchor is human-edited alongside the Move source so any
 * `if (t == tier_X) { N }` change must also bump the JSON literal — the test
 * then asserts equality with `TIER_BENEFITS`. Regex over Move syntax was
 * considered and rejected as fragile (whitespace/comment variations would
 * silently fail).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MovePolicySpec {
  fee_discount_bps: Record<'1' | '2' | '3', number>;
  staking_multiplier_bps: Record<'1' | '2' | '3', number>;
  lp_yield_multiplier_bps: Record<'1' | '2' | '3', number>;
  inference_subsidy_bps: Record<'1' | '2' | '3', number>;
  max_bet_floor_usdc: Record<'1' | '2' | '3', number>;
  can_create_vault: Record<'1' | '2' | '3', boolean>;
}

/**
 * Default location relative to this file: walk up two levels (test-utils
 * → src → package root) then sideways into nasun-tier. The two packages are
 * workspace siblings, so this path is stable across local dev and CI.
 */
function defaultPolicyMovePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../nasun-tier/sources/policy.move');
}

/**
 * Read `policy.move` and extract the JSON_ANCHOR block. Throws on any parse
 * failure — tests should let it propagate so the failure surfaces clearly.
 *
 * @param movePath  Override path (used in tests with synthetic fixtures).
 */
export function readMovePolicyAnchor(movePath?: string): MovePolicySpec {
  const path = movePath ?? defaultPolicyMovePath();
  const source = readFileSync(path, 'utf8');

  // Match the JSON_ANCHOR block. The anchor marker is a fixed string so
  // accidental matches against unrelated comments are not possible.
  const match = source.match(
    /JSON_ANCHOR:[^\n]*\n((?:\s*\/\/[^\n]*\n)*)/,
  );
  if (!match) {
    throw new Error(
      `JSON_ANCHOR not found in ${path}. ` +
        `Expected a "// JSON_ANCHOR: ..." comment followed by JSON inside ` +
        `subsequent "// " comment lines at the bottom of policy.move.`,
    );
  }

  // Strip leading `//` markers from each captured line, then join.
  const jsonLines = match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/\s?/, ''))
    .join('\n')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLines);
  } catch (err) {
    throw new Error(
      `JSON_ANCHOR block parse error in ${path}: ${err instanceof Error ? err.message : String(err)}\n` +
        `Block contents:\n${jsonLines}`,
    );
  }

  // Light shape validation — the test does precise field-level assertions, so
  // here we just confirm the top-level keys exist.
  const required = [
    'fee_discount_bps',
    'staking_multiplier_bps',
    'lp_yield_multiplier_bps',
    'inference_subsidy_bps',
    'max_bet_floor_usdc',
    'can_create_vault',
  ] as const;
  for (const key of required) {
    if (!(key in (parsed as Record<string, unknown>))) {
      throw new Error(`JSON_ANCHOR missing required key "${key}" in ${path}`);
    }
  }

  return parsed as MovePolicySpec;
}
