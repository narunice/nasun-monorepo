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

// Object id: 0x followed by 1..64 hex chars.
const OBJECT_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;
// Move identifier: ASCII letters/digits/underscore, starting with non-digit,
// 1..255 chars per Move's identifier spec.
const MOVE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/;
// Move TypeName: `<address>::<module>::<TypeName>`. We require the address
// portion to be a 0x... hex blob (no aliases) and tolerate generic type
// parameters in the trailing position, e.g. `<...>::Coin<X>` — we don't
// validate inside the angle brackets but require it close.
const MOVE_TYPENAME_RE =
  /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]{0,254}::[A-Za-z_][A-Za-z0-9_]{0,254}(<.+>)?$/;

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
      // F10: shape-validate substituted values, not just the env presence.
      // A typo'd PADO_DEEPBOOK_PACKAGE_ID='0xabc-not-an-id' would otherwise
      // be admitted into the allowlist and only surface when the PTB
      // builder asserts on it. Fail loud at boot.
      const pkg = resolveEnvString(tt.package, `${key}.targets[${i}].package`);
      if (!OBJECT_ID_RE.test(pkg)) {
        throw new Error(
          `action-classes.json: "${key}.targets[${i}].package" must be a Sui object id (0x<hex>), got "${pkg}"`,
        );
      }
      const mod = resolveEnvString(tt.module, `${key}.targets[${i}].module`);
      if (!MOVE_IDENT_RE.test(mod)) {
        throw new Error(
          `action-classes.json: "${key}.targets[${i}].module" must be a Move identifier, got "${mod}"`,
        );
      }
      const fnsRaw = tt.functions;
      if (!Array.isArray(fnsRaw)) {
        throw new Error(`action-classes.json: "${key}.targets[${i}].functions" must be an array`);
      }
      const functions = fnsRaw.map((f, j) => {
        const fn = resolveEnvString(f, `${key}.targets[${i}].functions[${j}]`);
        if (!MOVE_IDENT_RE.test(fn)) {
          throw new Error(
            `action-classes.json: "${key}.targets[${i}].functions[${j}]" must be a Move identifier, got "${fn}"`,
          );
        }
        return fn;
      });
      return { package: pkg, module: mod, functions };
    });
    const assets = assetsRaw.map((a, i) => {
      const ty = resolveEnvString(a, `${key}.assets[${i}]`);
      if (!MOVE_TYPENAME_RE.test(ty)) {
        throw new Error(
          `action-classes.json: "${key}.assets[${i}]" must be a Move TypeName (<addr>::<mod>::<Type>), got "${ty}"`,
        );
      }
      return ty;
    });
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
