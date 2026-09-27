/**
 * Guards for the alert sender.
 *
 * The absence of a parse mode and the single-sender rule are both load-bearing,
 * and both failed silently before. drift-keeper's cursor_lag_severe body names
 * `indexer_cursor`, whose one underscore legacy Markdown read as an
 * unterminated italic, so Telegram rejected the message with HTTP 400 on every
 * tick since the alert shipped. Nothing surfaced it: the sender logs only on
 * success and latches the cooldown only on success, so a permanent rejection is
 * indistinguishable from "no alert was warranted" while retrying every 5
 * minutes. The stuck reconciler backlog it reports had never reached anyone.
 *
 * The body scan reads source rather than calling the loops, whose alert paths
 * need Postgres, Sui RPC and Telegram. Same approach as
 * db/schema-audit.test.ts: cheap invariant, no fixtures.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _FAILURE_STREAK_ESCALATE,
  _failureStreakForTests,
  _noteFailure,
  _noteSuccess,
  _resetTelegramStateForTests,
  _TELEGRAM_PARSE_MODE,
} from './telegram.js';

const ALERT_SOURCES = ['risk-alert', 'drift-keeper'] as const;

function source(name: string): string {
  return readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
}

/**
 * Every string literal a body can be built from, including the ternary
 * continuations that hold ratioLine and capLine. Those continuation lines
 * (`? '…'`, `: '…'`) are where the removed Markdown actually lived, so a filter
 * anchored on indentation alone would scan none of the interesting text.
 */
function messageLiterals(name: string): string[] {
  return source(name)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[?:]?\s*('|`)/.test(line))
    .filter((line) => !line.startsWith("'[") && !line.startsWith('`['));
}

describe('parse mode', () => {
  it('is absent, so no wording can make a message undeliverable', () => {
    expect(_TELEGRAM_PARSE_MODE).toBeNull();
  });

  it('is absent in the request the sender actually builds', () => {
    // HTML would only move the hazard from `_` to an unescaped `<` or `&`, and
    // phrases like "cap_bps > 0" belong in these bodies. Matches the property
    // assignment specifically; the doc comment names the field in prose.
    expect(source('telegram')).not.toMatch(/parse_mode\s*:/);
  });
});

describe('single sender', () => {
  it.each(ALERT_SOURCES)('%s declares no sender of its own', (name) => {
    // Two private copies are why the rejection was only ever observable in one
    // loop. Both must route through telegram.ts.
    const src = source(name);
    expect(src).not.toMatch(/api\.telegram\.org/);
    expect(src).not.toMatch(/parse_mode\s*:/);
    expect(src).toContain("from './telegram.js'");
  });
});

describe('alert bodies', () => {
  it('scans the ternary continuation lines, not just the indented ones', () => {
    // Lock the scanner itself: ratioLine and capLine are `? '…'` / `: '…'`
    // shapes, and an earlier version of this spec skipped them entirely, which
    // let exactly the text being fixed sail through green.
    const lits = messageLiterals('risk-alert');
    expect(lits.some((l) => l.includes('No on-chain cap configured'))).toBe(true);
    expect(lits.some((l) => l.includes('pool balance is zero'))).toBe(true);
  });

  it.each(ALERT_SOURCES)('%s carries no markup a plain-text send would expose', (name) => {
    // Markdown or HTML left in a plain-text body does not fail the send; it
    // renders as literal asterisks or visible tags in the operator channel.
    const offenders = messageLiterals(name).filter(
      (line) => /\*[^*]+\*/.test(line) || /<\/?(?:b|i|u|s|code|pre)>/.test(line) || /\\`/.test(line),
    );
    expect(offenders).toEqual([]);
  });
});

describe('persistent failure escalation', () => {
  beforeEach(() => {
    _resetTelegramStateForTests();
    vi.restoreAllMocks();
  });

  it('warns while a failure could still be a blip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 1; i < _FAILURE_STREAK_ESCALATE; i += 1) {
      _noteFailure('risk-alert', 'non-ok 502');
      expect(_failureStreakForTests('risk-alert')).toBe(i);
    }
    expect(warn).toHaveBeenCalledTimes(_FAILURE_STREAK_ESCALATE - 1);
    expect(error).not.toHaveBeenCalled();
  });

  it('escalates to error once the streak means alerting is down', () => {
    // The whole point: a permanent rejection must stop looking like silence.
    // 94 consecutive ones went unnoticed as warnings.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < _FAILURE_STREAK_ESCALATE; i += 1) {
      _noteFailure('drift-keeper', 'non-ok 400');
    }
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('TELEGRAM ALERTING DOWN');
    expect(String(error.mock.calls[0]?.[0])).toContain('non-ok 400');
  });

  it('keeps streaks per caller so one loop does not mask the other', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    _noteFailure('risk-alert', 'x');
    expect(_failureStreakForTests('risk-alert')).toBe(1);
    expect(_failureStreakForTests('drift-keeper')).toBe(0);
  });

  it('clears the streak on success and says so after an escalation', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < _FAILURE_STREAK_ESCALATE; i += 1) {
      _noteFailure('risk-alert', 'x');
    }
    _noteSuccess('risk-alert');
    expect(_failureStreakForTests('risk-alert')).toBe(0);
    expect(String(error.mock.calls.at(-1)?.[0])).toContain('recovered');
  });

  it('stays quiet on a success that follows no failures', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    _noteSuccess('risk-alert');
    expect(error).not.toHaveBeenCalled();
  });
});
