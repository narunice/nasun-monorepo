/**
 * Creator Posts — pure logic edge case suite.
 *
 * Run with:
 *   npx --no-install tsx --test apps/nasun-website/cdk/lambda-src/bug-report/src/__tests__/creator-posts-utils.test.ts
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTweetUrl,
  normalizeHandle,
  safeImageUrl,
  startOfKstTodayIso,
  kstNextMidnightIso,
  encodeCursor,
  decodeCursor,
  handlesMatch,
} from '../creator-posts-utils';

// =====================================================================
// parseTweetUrl — URL regex + canonicalization + XSS/path-injection gate
// =====================================================================

describe('parseTweetUrl', () => {
  test('accepts canonical x.com URL', () => {
    const r = parseTweetUrl('https://x.com/naru/status/1234567890123456789');
    assert.deepEqual(r, {
      postId: '1234567890123456789',
      handle: 'naru',
      canonicalUrl: 'https://x.com/naru/status/1234567890123456789',
    });
  });

  test('accepts twitter.com and canonicalizes to x.com', () => {
    const r = parseTweetUrl('https://twitter.com/Alice_01/status/987654321');
    assert.ok(r);
    assert.equal(r!.canonicalUrl, 'https://x.com/alice_01/status/987654321');
    assert.equal(r!.handle, 'alice_01'); // lowercased
  });

  test('ignores trailing slash', () => {
    const r = parseTweetUrl('https://x.com/bob/status/100000/');
    assert.equal(r?.postId, '100000');
  });

  test('strips query string (tracking params)', () => {
    const r = parseTweetUrl('https://x.com/bob/status/100000?s=20&t=abc');
    assert.equal(r?.canonicalUrl, 'https://x.com/bob/status/100000');
  });

  test('strips hash fragment', () => {
    const r = parseTweetUrl('https://x.com/bob/status/100000#comment');
    assert.equal(r?.canonicalUrl, 'https://x.com/bob/status/100000');
  });

  test('accepts /photo/1 subpath', () => {
    const r = parseTweetUrl('https://x.com/bob/status/123456/photo/1');
    assert.equal(r?.postId, '123456');
  });

  test('rejects http (no scheme downgrade)', () => {
    assert.equal(parseTweetUrl('http://x.com/bob/status/100000'), null);
  });

  test('rejects javascript: scheme', () => {
    assert.equal(parseTweetUrl('javascript:alert(1)'), null);
    assert.equal(parseTweetUrl('javascript://x.com/bob/status/100000'), null);
  });

  test('rejects data: URI', () => {
    assert.equal(parseTweetUrl('data:text/html,<script>alert(1)</script>'), null);
  });

  test('rejects /i/web/status/... variant (no handle)', () => {
    assert.equal(
      parseTweetUrl('https://x.com/i/web/status/1234567890123456789'),
      null,
    );
  });

  test('rejects handle longer than 15 chars', () => {
    assert.equal(
      parseTweetUrl('https://x.com/sixteencharhandlz/status/123456'),
      null,
    );
  });

  test('rejects handle with special chars', () => {
    assert.equal(parseTweetUrl('https://x.com/naru$/status/123456'), null);
    assert.equal(parseTweetUrl('https://x.com/naru-/status/123456'), null);
    assert.equal(parseTweetUrl('https://x.com/na.ru/status/123456'), null);
    assert.equal(parseTweetUrl('https://x.com/na ru/status/123456'), null);
  });

  test('rejects tweet id shorter than 5 digits', () => {
    assert.equal(parseTweetUrl('https://x.com/naru/status/1234'), null);
  });

  test('rejects tweet id longer than 25 digits', () => {
    const id26 = '1'.repeat(26);
    assert.equal(parseTweetUrl(`https://x.com/naru/status/${id26}`), null);
  });

  test('rejects non-numeric tweet id', () => {
    assert.equal(parseTweetUrl('https://x.com/naru/status/abcdef'), null);
    assert.equal(parseTweetUrl('https://x.com/naru/status/12345abc'), null);
  });

  test('rejects padded tweet id with leading zero (ambiguity)', () => {
    assert.equal(parseTweetUrl('https://x.com/naru/status/01234567'), null);
  });

  test('rejects sub.x.com (no wildcard host)', () => {
    assert.equal(parseTweetUrl('https://evil.x.com/naru/status/100000'), null);
  });

  test('rejects empty / whitespace input', () => {
    assert.equal(parseTweetUrl(''), null);
    assert.equal(parseTweetUrl('   '), null);
  });

  test('rejects non-string input', () => {
    assert.equal(parseTweetUrl(null), null);
    assert.equal(parseTweetUrl(undefined), null);
    assert.equal(parseTweetUrl(42 as unknown as string), null);
    assert.equal(parseTweetUrl({} as unknown as string), null);
  });

  test('trims surrounding whitespace', () => {
    const r = parseTweetUrl('  https://x.com/naru/status/100000  ');
    assert.equal(r?.postId, '100000');
  });

  test('lowercases uppercase handle consistently', () => {
    const r = parseTweetUrl('https://x.com/NARU/status/100000');
    assert.equal(r?.handle, 'naru');
    assert.equal(r?.canonicalUrl, 'https://x.com/naru/status/100000');
  });

  test('rejects X web short URL without status/', () => {
    assert.equal(parseTweetUrl('https://x.com/naru'), null);
    assert.equal(parseTweetUrl('https://x.com/naru/'), null);
  });

  test('rejects URL-encoded injection in path', () => {
    assert.equal(
      parseTweetUrl(
        'https://x.com/naru/status/123456%2Fextra%2Fpath',
      ),
      null,
    );
  });

  test('accepts single-char handle', () => {
    const r = parseTweetUrl('https://x.com/a/status/12345');
    assert.equal(r?.handle, 'a');
  });

  test('accepts 15-char handle (max)', () => {
    const h = 'a'.repeat(15);
    const r = parseTweetUrl(`https://x.com/${h}/status/12345`);
    assert.equal(r?.handle, h);
  });

  test('accepts 5-digit tweet id (min)', () => {
    const r = parseTweetUrl('https://x.com/a/status/12345');
    assert.equal(r?.postId, '12345');
  });

  test('accepts 25-digit tweet id (max)', () => {
    const id = '1' + '0'.repeat(24);
    const r = parseTweetUrl(`https://x.com/a/status/${id}`);
    assert.equal(r?.postId, id);
  });
});

// =====================================================================
// normalizeHandle — input sanitization at the UserProfiles boundary
// =====================================================================

describe('normalizeHandle', () => {
  test('strips leading @', () => {
    assert.equal(normalizeHandle('@naru'), 'naru');
  });

  test('lowercases', () => {
    assert.equal(normalizeHandle('NaRu'), 'naru');
    assert.equal(normalizeHandle('@NARU'), 'naru');
  });

  test('accepts underscores and digits', () => {
    assert.equal(normalizeHandle('naru_01'), 'naru_01');
  });

  test('rejects hyphens', () => {
    assert.equal(normalizeHandle('naru-01'), null);
  });

  test('rejects spaces', () => {
    assert.equal(normalizeHandle('naru 01'), null);
  });

  test('rejects empty', () => {
    assert.equal(normalizeHandle(''), null);
    assert.equal(normalizeHandle('@'), null);
  });

  test('rejects over 15 chars', () => {
    assert.equal(normalizeHandle('a'.repeat(16)), null);
  });

  test('rejects non-string', () => {
    assert.equal(normalizeHandle(null), null);
    assert.equal(normalizeHandle(undefined), null);
    assert.equal(normalizeHandle(42 as unknown as string), null);
  });

  test('does not strip double @', () => {
    // Only leading `@` is stripped; `@@foo` becomes `@foo` which fails regex.
    assert.equal(normalizeHandle('@@foo'), null);
  });

  test('rejects unicode homoglyph', () => {
    // Cyrillic "a"
    assert.equal(normalizeHandle('naru\u0430'), null);
  });
});

// =====================================================================
// safeImageUrl — XSS/SSRF defense on user-writable image field
// =====================================================================

describe('safeImageUrl', () => {
  test('accepts pbs.twimg.com https', () => {
    const u = 'https://pbs.twimg.com/profile_images/123/abc_normal.jpg';
    assert.equal(safeImageUrl(u), u);
  });

  test('accepts abs.twimg.com https', () => {
    const u = 'https://abs.twimg.com/sticky/default_profile_images/default_profile.png';
    assert.equal(safeImageUrl(u), u);
  });

  test('rejects http (downgrade attack)', () => {
    assert.equal(safeImageUrl('http://pbs.twimg.com/x.jpg'), null);
  });

  test('rejects javascript:', () => {
    assert.equal(safeImageUrl('javascript:alert(1)'), null);
  });

  test('rejects data: URI', () => {
    assert.equal(safeImageUrl('data:image/png;base64,AAA='), null);
  });

  test('rejects non-allowlisted host', () => {
    assert.equal(safeImageUrl('https://evil.com/a.jpg'), null);
    assert.equal(safeImageUrl('https://pbs.twimg.com.evil.com/a.jpg'), null);
  });

  test('rejects subdomain of allowlisted', () => {
    assert.equal(safeImageUrl('https://evil.pbs.twimg.com/a.jpg'), null);
  });

  test('rejects empty / null / non-string', () => {
    assert.equal(safeImageUrl(''), null);
    assert.equal(safeImageUrl(null), null);
    assert.equal(safeImageUrl(undefined), null);
    assert.equal(safeImageUrl(42 as unknown as string), null);
  });

  test('rejects malformed URL', () => {
    assert.equal(safeImageUrl('not a url'), null);
    assert.equal(safeImageUrl('https://'), null);
  });

  test('preserves query string + path (no mutation)', () => {
    const u = 'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg?fmt=webp';
    assert.equal(safeImageUrl(u), u);
  });

  test('normalizes URL (trailing slash on empty path is added)', () => {
    // new URL('https://pbs.twimg.com').toString() === 'https://pbs.twimg.com/'
    assert.equal(
      safeImageUrl('https://pbs.twimg.com'),
      'https://pbs.twimg.com/',
    );
  });
});

// =====================================================================
// KST boundary math (Asia/Seoul, UTC+09:00, no DST)
// =====================================================================

describe('startOfKstTodayIso', () => {
  test('KST 00:30 -> same day KST 00:00 = prev UTC 15:00', () => {
    // 2026-04-12T00:30:00+09:00 = 2026-04-11T15:30:00Z
    const now = Date.parse('2026-04-11T15:30:00Z');
    // KST day starts at 2026-04-11T15:00:00Z
    assert.equal(startOfKstTodayIso(now), '2026-04-11T15:00:00.000Z');
  });

  test('KST 14:59 same day boundary', () => {
    // 2026-04-12T14:59:00+09:00 = 2026-04-12T05:59:00Z
    const now = Date.parse('2026-04-12T05:59:00Z');
    // Still in KST day that started at 2026-04-11T15:00:00Z
    assert.equal(startOfKstTodayIso(now), '2026-04-11T15:00:00.000Z');
  });

  test('KST 15:00 UTC = new KST day', () => {
    // 2026-04-12T00:00:00+09:00 = 2026-04-11T15:00:00Z — exactly at boundary
    const now = Date.parse('2026-04-11T15:00:00Z');
    assert.equal(startOfKstTodayIso(now), '2026-04-11T15:00:00.000Z');
  });

  test('KST 14:59:59 UTC = previous KST day', () => {
    // 1 ms before KST midnight
    const now = Date.parse('2026-04-11T14:59:59.999Z');
    assert.equal(startOfKstTodayIso(now), '2026-04-10T15:00:00.000Z');
  });

  test('monotonic: start < next midnight', () => {
    const now = Date.now();
    assert.ok(startOfKstTodayIso(now) < kstNextMidnightIso(now));
  });

  test('window is exactly 24h', () => {
    const now = Date.parse('2026-04-12T03:00:00Z');
    const start = Date.parse(startOfKstTodayIso(now));
    const next = Date.parse(kstNextMidnightIso(now));
    assert.equal(next - start, 86400000);
  });

  test('leap-second rounding does not break day bucketing', () => {
    // Spot-check across a year
    for (let d = 0; d < 365; d++) {
      const now = Date.parse('2026-01-01T00:00:00Z') + d * 86400000;
      const start = startOfKstTodayIso(now);
      const next = kstNextMidnightIso(now);
      const sMs = Date.parse(start);
      const nMs = Date.parse(next);
      assert.equal(nMs - sMs, 86400000, `day offset at d=${d}`);
      // Both ISO strings end with T15:00:00.000Z (KST midnight in UTC)
      assert.ok(start.endsWith('T15:00:00.000Z'), `start fmt d=${d}: ${start}`);
      assert.ok(next.endsWith('T15:00:00.000Z'), `next fmt d=${d}: ${next}`);
    }
  });
});

// =====================================================================
// cursor encode/decode — pagination pagination integrity
// =====================================================================

describe('encodeCursor / decodeCursor', () => {
  test('encodes and decodes symmetrically', () => {
    const key = { postId: '1234567890', identityId: 'us-east-1:abc', createdAt: '2026-04-12T00:00:00.000Z' };
    const enc = encodeCursor(key);
    assert.ok(enc);
    const dec = decodeCursor(enc);
    assert.deepEqual(dec, key);
  });

  test('undefined input returns undefined', () => {
    assert.equal(encodeCursor(undefined), undefined);
    assert.equal(decodeCursor(undefined), undefined);
  });

  test('invalid base64 returns undefined', () => {
    assert.equal(decodeCursor('!!!not-base64!!!'), undefined);
  });

  test('malformed JSON returns undefined', () => {
    const bad = Buffer.from('not json', 'utf8').toString('base64url');
    assert.equal(decodeCursor(bad), undefined);
  });

  test('non-object JSON returns undefined', () => {
    const arr = Buffer.from('[1,2,3]', 'utf8').toString('base64url');
    // Arrays are objects in JS; should still decode. Verify behavior.
    const s = Buffer.from('"string"', 'utf8').toString('base64url');
    assert.equal(decodeCursor(s), undefined);

    const n = Buffer.from('42', 'utf8').toString('base64url');
    assert.equal(decodeCursor(n), undefined);

    const b = Buffer.from('true', 'utf8').toString('base64url');
    assert.equal(decodeCursor(b), undefined);

    // Arrays pass through (this is acceptable; they won't match ExclusiveStartKey contract at DDB level).
    assert.deepEqual(decodeCursor(arr), [1, 2, 3] as unknown as Record<string, unknown>);
  });

  test('null JSON returns undefined (not a valid key)', () => {
    const nul = Buffer.from('null', 'utf8').toString('base64url');
    assert.equal(decodeCursor(nul), undefined);
  });

  test('base64url is URL-safe (no + or /)', () => {
    const key = { postId: '?'.repeat(50) };
    const enc = encodeCursor(key)!;
    assert.ok(!enc.includes('+'));
    assert.ok(!enc.includes('/'));
    assert.ok(!enc.includes('='));
  });
});

// =====================================================================
// handlesMatch — defensive boundary
// =====================================================================

describe('handlesMatch', () => {
  test('matches case-insensitively', () => {
    assert.equal(handlesMatch('NARU', 'naru'), true);
    assert.equal(handlesMatch('naru', 'NARU'), true);
  });

  test('strips leading @ on my handle', () => {
    assert.equal(handlesMatch('naru', '@naru'), true);
  });

  test('does not strip @ from url handle (regex rejects)', () => {
    assert.equal(handlesMatch('@naru', 'naru'), false);
  });

  test('rejects mismatched handles', () => {
    assert.equal(handlesMatch('naru', 'bob'), false);
  });

  test('rejects if either side fails regex', () => {
    assert.equal(handlesMatch('naru-', 'naru'), false);
    assert.equal(handlesMatch('naru', 'naru-'), false);
    assert.equal(handlesMatch('', 'naru'), false);
    assert.equal(handlesMatch('naru', ''), false);
  });

  test('rejects non-string', () => {
    assert.equal(handlesMatch(null, 'naru'), false);
    assert.equal(handlesMatch('naru', null), false);
    assert.equal(handlesMatch(42 as unknown as string, 'naru'), false);
  });
});
