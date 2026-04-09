import { describe, it, expect } from 'vitest';
import { sanitizeContent, stripControlChars, hasReservedPrefix } from '../sanitize.js';

describe('sanitizeContent', () => {
  it('encodes HTML special characters', () => {
    expect(sanitizeContent('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('encodes ampersands', () => {
    expect(sanitizeContent('foo & bar')).toBe('foo &amp; bar');
  });

  it('encodes single quotes and backticks', () => {
    expect(sanitizeContent("it's a `test`")).toBe("it&#x27;s a &#96;test&#96;");
  });

  it('handles empty string', () => {
    expect(sanitizeContent('')).toBe('');
  });

  it('handles string with no special characters', () => {
    expect(sanitizeContent('hello world 123')).toBe('hello world 123');
  });

  it('handles multiple consecutive special characters', () => {
    expect(sanitizeContent('<<<>>>')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
  });

  it('handles mixed content', () => {
    expect(sanitizeContent('Price: $10 & <b>bold</b>')).toBe(
      'Price: $10 &amp; &lt;b&gt;bold&lt;/b&gt;'
    );
  });
});

describe('stripControlChars', () => {
  it('strips null bytes', () => {
    expect(stripControlChars('hello\u0000world')).toBe('helloworld');
  });

  it('strips C0 control characters (except tab, newline, carriage return)', () => {
    // Tab (\u0009), newline (\u000A), carriage return (\u000D) should be preserved
    expect(stripControlChars('a\tb\nc\rd')).toBe('a\tb\nc\rd');
    // Others in C0 range should be stripped
    expect(stripControlChars('a\u0001b\u0002c')).toBe('abc');
    expect(stripControlChars('a\u0008b')).toBe('ab');
  });

  it('strips C1 control characters', () => {
    expect(stripControlChars('a\u0080b\u009Fc')).toBe('abc');
  });

  it('strips zero-width characters', () => {
    expect(stripControlChars('a\u200Bb\u200Cc\u200Dd')).toBe('abcd');
    // Zero-width no-break space (BOM)
    expect(stripControlChars('a\uFEFFb')).toBe('ab');
  });

  it('strips bidi override characters', () => {
    expect(stripControlChars('a\u202Ab\u202Bc\u202Cd\u202De')).toBe('abcde');
  });

  it('strips line/paragraph separators', () => {
    expect(stripControlChars('a\u2028b\u2029c')).toBe('abc');
  });

  it('preserves normal text', () => {
    expect(stripControlChars('Hello, World! 123')).toBe('Hello, World! 123');
  });

  it('preserves emoji', () => {
    const text = 'Hello 🌍 World 🚀';
    expect(stripControlChars(text)).toBe(text);
  });

  it('preserves unicode text (Korean, Japanese, etc)', () => {
    const text = '안녕하세요 こんにちは';
    expect(stripControlChars(text)).toBe(text);
  });

  it('handles empty string', () => {
    expect(stripControlChars('')).toBe('');
  });

  it('handles string of only control characters', () => {
    expect(stripControlChars('\u0000\u0001\u0002')).toBe('');
  });

  it('strips mixed control characters in realistic attack payload', () => {
    // Bidi override attack: right-to-left override to disguise file extension
    const attack = 'file\u202Efdp.exe';
    expect(stripControlChars(attack)).toBe('filefdp.exe');
  });
});

describe('hasReservedPrefix', () => {
  it('detects [SYSTEM] prefix', () => {
    expect(hasReservedPrefix('[SYSTEM] Server restart')).toBe(true);
  });

  it('detects [BOT] prefix', () => {
    expect(hasReservedPrefix('[BOT] Automated message')).toBe(true);
  });

  it('detects case-insensitive', () => {
    expect(hasReservedPrefix('[system] test')).toBe(true);
    expect(hasReservedPrefix('[System] test')).toBe(true);
    expect(hasReservedPrefix('[bot] test')).toBe(true);
    expect(hasReservedPrefix('[Bot] test')).toBe(true);
  });

  it('detects with leading whitespace', () => {
    expect(hasReservedPrefix('  [SYSTEM] test')).toBe(true);
    expect(hasReservedPrefix('\t[BOT] test')).toBe(true);
  });

  it('does not flag normal messages', () => {
    expect(hasReservedPrefix('Hello world')).toBe(false);
    expect(hasReservedPrefix('My [SYSTEM] is broken')).toBe(false);
    expect(hasReservedPrefix('Check the bot')).toBe(false);
  });

  it('does not flag similar but incomplete prefixes', () => {
    expect(hasReservedPrefix('[SYS] test')).toBe(false);
    expect(hasReservedPrefix('[BO] test')).toBe(false);
    expect(hasReservedPrefix('SYSTEM test')).toBe(false);
  });

  it('handles empty string', () => {
    expect(hasReservedPrefix('')).toBe(false);
  });

  it('handles string that is just the prefix', () => {
    expect(hasReservedPrefix('[SYSTEM]')).toBe(true);
    expect(hasReservedPrefix('[BOT]')).toBe(true);
  });
});
