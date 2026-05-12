/**
 * Loader for `config/action-classes.json`.
 *
 * JSON values whose string equals `$NAME` are resolved against `process.env`
 * at boot. This keeps a single shared template across devnet/staging/prod
 * (a leading `$` makes the substitution obvious in code review) while
 * letting per-environment package ids stay in `.env`.
 *
 * The host calls this once at boot; the registry is immutable after that
 * point. A missing env var during substitution aborts startup loudly rather
 * than admitting a silently-empty allow list.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ActionTargetEntry {
  package: string;
  module: string;
  functions: string[];
}

export interface ActionClassEntry {
  targets: ActionTargetEntry[];
  assets: string[];
}

export type ActionClassRegistry = Record<string, ActionClassEntry>;

const DEFAULT_PATH = resolve(
  fileURLToPath(new URL('../../config/action-classes.json', import.meta.url)),
);

export function loadActionClasses(path: string = DEFAULT_PATH): ActionClassRegistry {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  const out: ActionClassRegistry = {};
  for (const [key, val] of Object.entries(raw)) {
    if (key.startsWith('$')) continue; // metadata fields like $comment
    if (typeof val !== 'object' || val === null) {
      throw new Error(`action-classes.json: entry "${key}" must be an object`);
    }
    const entry = val as Record<string, unknown>;
    const targetsRaw = entry.targets;
    const assetsRaw = entry.assets;
    if (!Array.isArray(targetsRaw)) {
      throw new Error(`action-classes.json: "${key}.targets" must be an array`);
    }
    if (!Array.isArray(assetsRaw)) {
      throw new Error(`action-classes.json: "${key}.assets" must be an array`);
    }
    const targets: ActionTargetEntry[] = targetsRaw.map((t, i) => {
      if (typeof t !== 'object' || t === null) {
        throw new Error(`action-classes.json: "${key}.targets[${i}]" must be an object`);
      }
      const tt = t as Record<string, unknown>;
      const pkg = resolveEnvString(tt.package, `${key}.targets[${i}].package`);
      const mod = resolveEnvString(tt.module, `${key}.targets[${i}].module`);
      const fnsRaw = tt.functions;
      if (!Array.isArray(fnsRaw)) {
        throw new Error(`action-classes.json: "${key}.targets[${i}].functions" must be an array`);
      }
      const functions = fnsRaw.map((f, j) =>
        resolveEnvString(f, `${key}.targets[${i}].functions[${j}]`),
      );
      return { package: pkg, module: mod, functions };
    });
    const assets = assetsRaw.map((a, i) =>
      resolveEnvString(a, `${key}.assets[${i}]`),
    );
    out[key] = { targets, assets };
  }
  return out;
}

function resolveEnvString(v: unknown, where: string): string {
  if (typeof v !== 'string') {
    throw new Error(`action-classes.json: "${where}" must be a string`);
  }
  if (!v.startsWith('$')) return v;
  const envKey = v.slice(1);
  const resolved = process.env[envKey];
  if (!resolved) {
    throw new Error(
      `action-classes.json: "${where}" references env var "${envKey}" which is unset. ` +
        'Set it in executor-nitro/.env before booting.',
    );
  }
  return resolved;
}
