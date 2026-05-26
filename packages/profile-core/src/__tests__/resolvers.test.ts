import { describe, it, expect } from 'vitest';
import {
  resolveDisplayName,
  resolveAvatarUrl,
  buildAvatarUrlFromKey,
} from '../resolvers.js';
import type { EcosystemProfile } from '../types.js';

const BASE = 'https://nasun-public-avatars-<account>.s3.ap-northeast-2.amazonaws.com';

describe('resolveDisplayName', () => {
  it('uses customDisplayName when set', () => {
    const p: EcosystemProfile = { customDisplayName: 'Alice' };
    expect(resolveDisplayName(p)).toEqual({ name: 'Alice', source: 'custom' });
  });

  it('falls back to twitter handle from linkedAccounts', () => {
    const p: EcosystemProfile = {
      linkedAccounts: { twitter: { username: 'john_x', originalTwitterHandle: 'John_X' } },
    };
    expect(resolveDisplayName(p)).toEqual({ name: 'John_X', source: 'twitter' });
  });

  it('falls back to provider=Twitter root field', () => {
    const p: EcosystemProfile = { provider: 'Twitter', twitterHandle: 'jane' };
    expect(resolveDisplayName(p)).toEqual({ name: 'jane', source: 'twitter' });
  });

  it('falls back to google email local part', () => {
    const p: EcosystemProfile = {
      linkedAccounts: { google: { email: 'alice@gmail.com' } },
    };
    expect(resolveDisplayName(p)).toEqual({ name: 'alice', source: 'google' });
  });

  it('falls back to wallet short form', () => {
    const p: EcosystemProfile = { walletAddress: '0x1234567890abcdef1234567890abcdef12345678' };
    expect(resolveDisplayName(p)).toEqual({ name: '0x1234...5678', source: 'wallet' });
  });

  it('returns User for empty profile', () => {
    expect(resolveDisplayName({})).toEqual({ name: 'User', source: 'wallet' });
    expect(resolveDisplayName(null)).toEqual({ name: 'User', source: 'wallet' });
  });

  it('priority: custom over twitter over google', () => {
    const p: EcosystemProfile = {
      customDisplayName: 'Custom',
      linkedAccounts: {
        twitter: { username: 'tw' },
        google: { email: 'g@gmail.com' },
      },
    };
    expect(resolveDisplayName(p)).toEqual({ name: 'Custom', source: 'custom' });
  });
});

describe('resolveAvatarUrl', () => {
  it('returns null for empty profile', () => {
    expect(resolveAvatarUrl({}, { baseUrl: BASE })).toBeNull();
  });

  it('builds URL from customAvatarKey', () => {
    const p: EcosystemProfile = { customAvatarKey: 'profile-images/abc/uuid.png' };
    expect(resolveAvatarUrl(p, { baseUrl: BASE })).toBe(
      `${BASE}/profile-images/abc/uuid.png`,
    );
  });

  it('falls through to twitter when customAvatarKey is empty', () => {
    const p: EcosystemProfile = {
      linkedAccounts: { twitter: { profileImageUrl: 'https://pbs.twimg.com/abc.jpg' } },
    };
    expect(resolveAvatarUrl(p, { baseUrl: BASE })).toBe('https://pbs.twimg.com/abc.jpg');
  });

  it('falls through to google when no twitter', () => {
    const p: EcosystemProfile = {
      linkedAccounts: { google: { profileImageUrl: 'https://lh3.googleusercontent.com/x' } },
    };
    expect(resolveAvatarUrl(p, { baseUrl: BASE })).toBe('https://lh3.googleusercontent.com/x');
  });

  it('priority: customAvatarKey over twitter over google', () => {
    const p: EcosystemProfile = {
      customAvatarKey: 'profile-images/abc/x.png',
      linkedAccounts: {
        twitter: { profileImageUrl: 'https://pbs.twimg.com/y.jpg' },
        google: { profileImageUrl: 'https://lh3.googleusercontent.com/z' },
      },
    };
    expect(resolveAvatarUrl(p, { baseUrl: BASE })).toBe(
      `${BASE}/profile-images/abc/x.png`,
    );
  });

  it('treats customAvatarBanned=true as no custom avatar (falls through)', () => {
    const p: EcosystemProfile = {
      customAvatarKey: 'profile-images/abc/x.png',
      customAvatarBanned: true,
      linkedAccounts: { twitter: { profileImageUrl: 'https://pbs.twimg.com/y.jpg' } },
    };
    expect(resolveAvatarUrl(p, { baseUrl: BASE })).toBe('https://pbs.twimg.com/y.jpg');
  });

  it('does NOT fall back to root profileImageUrl (legacy stale-URL guard)', () => {
    const p: EcosystemProfile = {
      // Suppose this was set when twitter was linked, then unlinked
      linkedAccounts: {},
    };
    expect(resolveAvatarUrl(p, { baseUrl: BASE })).toBeNull();
  });
});

describe('buildAvatarUrlFromKey', () => {
  it('returns null for empty key', () => {
    expect(buildAvatarUrlFromKey(null, BASE)).toBeNull();
    expect(buildAvatarUrlFromKey(undefined, BASE)).toBeNull();
    expect(buildAvatarUrlFromKey('', BASE)).toBeNull();
  });

  it('strips trailing slash from baseUrl', () => {
    expect(buildAvatarUrlFromKey('a/b.png', `${BASE}/`)).toBe(`${BASE}/a/b.png`);
  });

  it('strips leading slash from key', () => {
    expect(buildAvatarUrlFromKey('/a/b.png', BASE)).toBe(`${BASE}/a/b.png`);
  });

  it('baseUrl swap recomposes URL automatically', () => {
    const key = 'profile-images/abc/x.png';
    expect(buildAvatarUrlFromKey(key, 'https://avatars.nasun.io')).toBe(
      'https://avatars.nasun.io/profile-images/abc/x.png',
    );
    expect(buildAvatarUrlFromKey(key, 'https://cdn.example.com')).toBe(
      'https://cdn.example.com/profile-images/abc/x.png',
    );
  });
});
