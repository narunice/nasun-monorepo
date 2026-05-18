/**
 * Schema audit — fail the build if any indexer / api INSERT references a
 * column that the SQL migrations do not declare.
 *
 * Origin: 2026-05-18 Tier 0 e2e caught migration 001 omitting
 * gostop.lottery_round.draw_tx_digest while three consumers wrote/read it.
 * The indexer would have crashed on the first NumbersDrawn event in prod
 * and /lottery/draws returned HTTP 500 on every call. This test would have
 * caught that gap pre-commit.
 *
 * Scope: only INSERT column lists are audited (both raw `INSERT INTO X (a,b)`
 * and the postgres-js helper `INSERT INTO X ${sql(rows, 'a', 'b')}` form).
 * INSERTs are where missing-column regressions surface loudest because
 * Postgres rejects them at parse time. SELECT/UPDATE column references
 * surface as runtime errors too but are harder to extract reliably without
 * a full SQL parser, and they are usually colocated with INSERTs so the
 * INSERT audit catches the same schema drift in practice.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(HERE, '..', '..');
const MIGRATIONS_DIR = join(HERE, 'migrations');
const SRC_DIR = join(BACKEND_ROOT, 'src');

// ---------- helpers ---------------------------------------------------------

function listFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listFiles(full, suffix));
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

/** Strip /* ... *\/ and -- line comments from SQL text. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

/** Strip // and /* ... *\/ comments from TS text. */
function stripTsComments(ts: string): string {
  return ts
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ---------- migrations → { table → Set<column> } ---------------------------

function parseSchema(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const ensure = (t: string) => {
    let s = tables.get(t);
    if (!s) { s = new Set(); tables.set(t, s); }
    return s;
  };

  for (const file of listFiles(MIGRATIONS_DIR, '.sql')) {
    const raw = stripSqlComments(readFileSync(file, 'utf8'));

    // CREATE TABLE [IF NOT EXISTS] gostop.X ( body );  (also matches plain CREATE)
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?gostop\.(\w+)\s*\(([\s\S]*?)\)\s*;/gi;
    for (const m of raw.matchAll(createRe)) {
      const table = m[1]!.toLowerCase();
      const cols = ensure(table);
      // Body is comma-separated entries. Each entry's leading identifier is
      // either a column name or a constraint keyword. Filter out constraints.
      const entries = splitTopLevelByComma(m[2]!);
      for (const entry of entries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const firstTok = trimmed.split(/\s+/)[0]!.toUpperCase();
        if ([
          'CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN',
          'EXCLUDE', 'LIKE',
        ].includes(firstTok)) continue;
        const colMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (colMatch) cols.add(colMatch[1]!.toLowerCase());
      }
    }

    // ALTER TABLE gostop.X ADD COLUMN [IF NOT EXISTS] col TYPE
    const alterAddRe = /ALTER\s+TABLE\s+gostop\.(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
    for (const m of raw.matchAll(alterAddRe)) {
      ensure(m[1]!.toLowerCase()).add(m[2]!.toLowerCase());
    }
  }

  return tables;
}

/** Split a string at top-level commas, ignoring commas inside (...) groups. */
function splitTopLevelByComma(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') { depth++; buf += ch; continue; }
    if (ch === ')') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

// ---------- indexer / api INSERTs → [{ file, table, columns[] }] -----------

type InsertRef = { file: string; table: string; columns: string[] };

function parseInserts(): InsertRef[] {
  const out: InsertRef[] = [];

  for (const file of listFiles(SRC_DIR, '.ts')) {
    if (file.endsWith('.test.ts')) continue;
    const ts = stripTsComments(readFileSync(file, 'utf8'));
    const rel = relative(BACKEND_ROOT, file);

    // Pattern A: raw INSERT INTO gostop.X (a, b, c)  VALUES ...
    const rawRe = /INSERT\s+INTO\s+gostop\.(\w+)\s*\(([^)]+)\)/gi;
    for (const m of ts.matchAll(rawRe)) {
      const table = m[1]!.toLowerCase();
      // Skip if the body actually looks like a helper interpolation (starts with $).
      if (/\$\{/.test(m[2]!)) continue;
      const cols = m[2]!.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      out.push({ file: rel, table, columns: cols });
    }

    // Pattern B: helper INSERT INTO gostop.X ${sql( rows, 'a', 'b', ... )}
    // Capture the args of sql(...). First arg is the rows variable; the rest
    // are quoted column names.
    const helperRe = /INSERT\s+INTO\s+gostop\.(\w+)\s*\$\{\s*sql\s*\(\s*([\s\S]*?)\)\s*\}/gi;
    for (const m of ts.matchAll(helperRe)) {
      const table = m[1]!.toLowerCase();
      const args = m[2]!;
      // Extract every single-quoted or double-quoted identifier in the args.
      const cols = Array.from(args.matchAll(/['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g))
        .map((c) => c[1]!.toLowerCase());
      if (cols.length === 0) continue;  // probably not a column-list call
      out.push({ file: rel, table, columns: cols });
    }
  }

  return out;
}

// ---------- assertion -------------------------------------------------------

describe('gostop schema audit', () => {
  const schema = parseSchema();
  const inserts = parseInserts();

  it('parses every gostop.* table from migrations', () => {
    // Sanity guard: if the parser regresses to capturing zero tables, every
    // later assertion would silently no-op. Pin the lower bound to what
    // migration 001 ships (currently 7 tables: game_round, indexer_cursor,
    // user_settings, lottery_round, lottery_ticket, crash_round, crash_cashout).
    expect(schema.size).toBeGreaterThanOrEqual(7);
  });

  it('discovers at least the lottery + game_round INSERTs', () => {
    // Same logic: if the TS parser regresses, the test passes vacuously.
    // game_round and lottery_round / lottery_ticket are all written from
    // multiple indexer paths; the count must stay > 3.
    expect(inserts.length).toBeGreaterThan(3);
  });

  it('every INSERT column exists in migration schema', () => {
    const failures: string[] = [];
    for (const { file, table, columns } of inserts) {
      const tableCols = schema.get(table);
      if (!tableCols) {
        failures.push(`${file}: INSERT INTO gostop.${table} — table not in migrations`);
        continue;
      }
      for (const col of columns) {
        if (!tableCols.has(col)) {
          failures.push(
            `${file}: gostop.${table}.${col} referenced but missing from migrations`,
          );
        }
      }
    }
    expect(
      failures,
      `Schema audit failures (add a migration before merging):\n${failures.join('\n')}`,
    ).toEqual([]);
  });
});
