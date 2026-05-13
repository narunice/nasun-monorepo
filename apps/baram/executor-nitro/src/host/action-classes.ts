/**
 * Loader for `config/action-classes.json` (Plan C C3-v2 §4.5 schema).
 *
 * JSON values whose string equals `$NAME` are resolved against `process.env`
 * at boot. This keeps a single shared template across devnet/staging/prod
 * (a leading `$` makes the substitution obvious in code review) while
 * letting per-environment package ids stay in `.env`.
 *
 * The host calls this once at boot; the registry is immutable after that
 * point. A missing env var during substitution aborts startup loudly rather
 * than admitting a silently-empty allow list.
 *
 * v2 schema (C3-v2): `functions` is now an array of per-function records
 * with explicit arg/return positions for the pipe wiring, plus per-function
 * allowed input/output assets and poolId. Each action class also carries a
 * top-level `deepType` so the host doesn't hardcode it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ActionFunctionEntry {
  name: string;
  /** Symbolic placeholder names ("base", "quote", ...). The host PTB
   *  builder substitutes the actual TypeName strings at composition
   *  time using the input/output asset pair from the proposal. */
  typeArgs: string[];
  /** Positional index of the swap input `Coin<T>` arg in the Move
   *  signature (0-indexed, counting `self` as 0). The host wires the
   *  `withdraw_coin` pipe here. */
  inputCoinArg: number;
  /** Positional index of the `Coin<DEEP>` fee arg. The host wires the
   *  `zero_deep` pipe here. */
  deepCoinArg: number;
  /** Tuple return positions for the 3-coin swap return. */
  outputCoinResult: {
    primary: number;
    leftoverInput: number;
    leftoverDeep: number;
  };
  /** Fully-qualified TypeName strings the host preflight accepts as the
   *  swap input coin (must intersect cap.allowed_assets). */
  allowedInputAssets: string[];
  /** Fully-qualified TypeName strings the host preflight accepts as the
   *  swap primary output (must intersect cap.allowed_assets). */
  allowedOutputAssets: string[];
  /** Shared Pool object id this function targets. The host PTB builder
   *  asserts the proposal.exec.pool == this id. */
  poolId: string;
}

export interface ActionTargetEntry {
  package: string;
  module: string;
  functions: ActionFunctionEntry[];
}

export interface ActionClassEntry {
  targets: ActionTargetEntry[];
  /** Fully-qualified DEEP TypeName for the inline `coin::zero<DEEP>`
   *  command. Per OV6: action-class-scoped so different swap venues
   *  could declare different fee tokens in the future. */
  deepType: string;
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
// Move TypeName: `<address>::<module>::<TypeName>`.
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
    if (!Array.isArray(targetsRaw)) {
      throw new Error(`action-classes.json: "${key}.targets" must be an array`);
    }
    const deepType = resolveTypeName(entry.deepType, `${key}.deepType`);
    const targets: ActionTargetEntry[] = targetsRaw.map((t, i) =>
      parseTarget(t, `${key}.targets[${i}]`),
    );
    out[key] = { targets, deepType };
  }
  return out;
}

function parseTarget(t: unknown, where: string): ActionTargetEntry {
  if (typeof t !== 'object' || t === null) {
    throw new Error(`action-classes.json: "${where}" must be an object`);
  }
  const tt = t as Record<string, unknown>;
  const pkg = resolveEnvString(tt.package, `${where}.package`);
  if (!OBJECT_ID_RE.test(pkg)) {
    throw new Error(
      `action-classes.json: "${where}.package" must be a Sui object id (0x<hex>), got "${pkg}"`,
    );
  }
  const mod = resolveEnvString(tt.module, `${where}.module`);
  if (!MOVE_IDENT_RE.test(mod)) {
    throw new Error(
      `action-classes.json: "${where}.module" must be a Move identifier, got "${mod}"`,
    );
  }
  const fnsRaw = tt.functions;
  if (!Array.isArray(fnsRaw)) {
    throw new Error(`action-classes.json: "${where}.functions" must be an array`);
  }
  const functions = fnsRaw.map((f, j) => parseFunction(f, `${where}.functions[${j}]`));
  return { package: pkg, module: mod, functions };
}

function parseFunction(f: unknown, where: string): ActionFunctionEntry {
  if (typeof f !== 'object' || f === null) {
    throw new Error(`action-classes.json: "${where}" must be an object`);
  }
  const ff = f as Record<string, unknown>;
  const name = resolveEnvString(ff.name, `${where}.name`);
  if (!MOVE_IDENT_RE.test(name)) {
    throw new Error(
      `action-classes.json: "${where}.name" must be a Move identifier, got "${name}"`,
    );
  }
  const typeArgs = arrayOfStrings(ff.typeArgs, `${where}.typeArgs`);
  const inputCoinArg = nonNegativeInt(ff.inputCoinArg, `${where}.inputCoinArg`);
  const deepCoinArg = nonNegativeInt(ff.deepCoinArg, `${where}.deepCoinArg`);
  if (inputCoinArg === deepCoinArg) {
    throw new Error(
      `action-classes.json: "${where}" inputCoinArg and deepCoinArg must differ`,
    );
  }
  const outRaw = ff.outputCoinResult;
  if (typeof outRaw !== 'object' || outRaw === null) {
    throw new Error(`action-classes.json: "${where}.outputCoinResult" must be an object`);
  }
  const out = outRaw as Record<string, unknown>;
  const outputCoinResult = {
    primary: nonNegativeInt(out.primary, `${where}.outputCoinResult.primary`),
    leftoverInput: nonNegativeInt(out.leftoverInput, `${where}.outputCoinResult.leftoverInput`),
    leftoverDeep: nonNegativeInt(out.leftoverDeep, `${where}.outputCoinResult.leftoverDeep`),
  };
  const seen = new Set([
    outputCoinResult.primary,
    outputCoinResult.leftoverInput,
    outputCoinResult.leftoverDeep,
  ]);
  if (seen.size !== 3) {
    throw new Error(
      `action-classes.json: "${where}.outputCoinResult" positions must be distinct`,
    );
  }
  const allowedInputAssets = arrayOfTypeNames(
    ff.allowedInputAssets,
    `${where}.allowedInputAssets`,
  );
  const allowedOutputAssets = arrayOfTypeNames(
    ff.allowedOutputAssets,
    `${where}.allowedOutputAssets`,
  );
  const poolId = resolveEnvString(ff.poolId, `${where}.poolId`);
  if (!OBJECT_ID_RE.test(poolId)) {
    throw new Error(
      `action-classes.json: "${where}.poolId" must be a Sui object id (0x<hex>), got "${poolId}"`,
    );
  }
  return {
    name,
    typeArgs,
    inputCoinArg,
    deepCoinArg,
    outputCoinResult,
    allowedInputAssets,
    allowedOutputAssets,
    poolId,
  };
}

function arrayOfStrings(v: unknown, where: string): string[] {
  if (!Array.isArray(v)) throw new Error(`action-classes.json: "${where}" must be an array`);
  return v.map((x, i) => {
    if (typeof x !== 'string') {
      throw new Error(`action-classes.json: "${where}[${i}]" must be a string`);
    }
    return x;
  });
}

function arrayOfTypeNames(v: unknown, where: string): string[] {
  if (!Array.isArray(v)) throw new Error(`action-classes.json: "${where}" must be an array`);
  return v.map((x, i) => resolveTypeName(x, `${where}[${i}]`));
}

function resolveTypeName(v: unknown, where: string): string {
  const ty = resolveEnvString(v, where);
  if (!MOVE_TYPENAME_RE.test(ty)) {
    throw new Error(
      `action-classes.json: "${where}" must be a Move TypeName (<addr>::<mod>::<Type>), got "${ty}"`,
    );
  }
  return ty;
}

function nonNegativeInt(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`action-classes.json: "${where}" must be a non-negative integer`);
  }
  return v;
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

/**
 * Lookup helper: find a function entry by (package, module, fn name)
 * within a specific action class. Returns undefined if the class doesn't
 * exist or no matching function. Used by both preflight and the PTB
 * builder.
 */
export function findFunctionEntry(
  registry: ActionClassRegistry,
  actionType: string,
  targetPackage: string,
  module: string,
  fn: string,
): ActionFunctionEntry | undefined {
  const cls = registry[actionType];
  if (!cls) return undefined;
  const target = cls.targets.find((t) => t.package === targetPackage && t.module === module);
  if (!target) return undefined;
  return target.functions.find((f) => f.name === fn);
}
