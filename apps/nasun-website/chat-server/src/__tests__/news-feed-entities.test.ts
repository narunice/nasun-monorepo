import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities, toPlainText } from '../news-feed-api.js';

describe('decodeHtmlEntities', () => {
  it('decodes the numeric apostrophe that reached the UI verbatim', () => {
    expect(decodeHtmlEntities('Combinator&#39;s Fastest-Ever Unicorn')).toBe(
      "Combinator's Fastest-Ever Unicorn",
    );
  });

  it('decodes named and hex references', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry &lt;b&gt; &quot;hi&quot; &#x2026;')).toBe(
      'Tom & Jerry <b> "hi" …',
    );
  });

  it('decodes in a single pass so escaped markup stays escaped', () => {
    expect(decodeHtmlEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  it('leaves unknown and malformed references untouched', () => {
    expect(decodeHtmlEntities('&bogus; &# &#;')).toBe('&bogus; &# &#;');
  });

  it('refuses control characters and surrogates', () => {
    expect(decodeHtmlEntities('&#0;&#8;&#55296;')).toBe('&#0;&#8;&#55296;');
    expect(decodeHtmlEntities('&#1114112;')).toBe('&#1114112;');
  });

  it('keeps tab, newline and ordinary text intact', () => {
    expect(decodeHtmlEntities('a&#9;b&#10;c')).toBe('a\tb\nc');
    expect(decodeHtmlEntities('no entities here')).toBe('no entities here');
  });
});

describe('decodeHtmlEntities prototype safety', () => {
  it('does not resolve inherited object keys', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(decodeHtmlEntities(`a&${name};b`)).toBe(`a&${name};b`);
    }
  });
});

describe('toPlainText', () => {
  it('keeps text wrapped in escaped brackets', () => {
    expect(toPlainText('Why BTC &lt;$90K&gt; Matters')).toBe('Why BTC <$90K> Matters');
  });

  it('removes real markup and collapses whitespace', () => {
    expect(toPlainText('<p>Hello   <b>world</b></p>')).toBe('Hello world');
  });

  it('keeps a CDATA headline whose brackets are literal', () => {
    // A feed that CDATA-wraps the title delivers the brackets unescaped, so a
    // bare <...> strip would delete the middle of the headline.
    expect(toPlainText('Why BTC <$90K> Matters')).toBe('Why BTC <$90K> Matters');
    expect(toPlainText('Rates <3% and falling')).toBe('Rates <3% and falling');
  });

  it('still strips tags that a CDATA title carries', () => {
    expect(toPlainText('<em>Why</em> BTC <$90K> Matters')).toBe('Why BTC <$90K> Matters');
  });
})
