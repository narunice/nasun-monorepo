import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initStore, closeStore, getDb,
  toggleFollow, getFollowing, getFollowerCounts, getFollowingCount,
} from '../store.js';
import { type ChatServerConfig, DEFAULT_CONFIG } from '../types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeConfig(): ChatServerConfig {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-follow-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(tempDir, 'test.db'),
    allowedOrigins: ['http://localhost'],
  };
}

let config: ChatServerConfig;

beforeEach(() => {
  config = makeConfig();
  initStore(config);
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
    rmSync(config.dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ===== toggleFollow =====

describe('toggleFollow', () => {
  it('follows a user', () => {
    const result = toggleFollow('0xAAA', '0xBBB');
    expect(result.following).toBe(true);
    expect(result.followerCount).toBe(1);
  });

  it('unfollows on second toggle', () => {
    toggleFollow('0xAAA', '0xBBB');
    const result = toggleFollow('0xAAA', '0xBBB');
    expect(result.following).toBe(false);
    expect(result.followerCount).toBe(0);
  });

  it('rejects self-follow', () => {
    expect(() => toggleFollow('0xAAA', '0xAAA')).toThrow('SELF_FOLLOW');
  });

  it('rejects self-follow (case insensitive)', () => {
    expect(() => toggleFollow('0xAaA', '0xaAa')).toThrow('SELF_FOLLOW');
  });

  it('normalizes addresses to lowercase', () => {
    toggleFollow('0xAAA', '0xBBB');
    // getFollowing should return lowercase
    const following = getFollowing('0xAAA');
    expect(following).toEqual(['0xbbb']);
  });

  it('enforces MAX_FOLLOWED limit (50)', () => {
    // Follow 50 users
    for (let i = 0; i < 50; i++) {
      toggleFollow('0xAAA', `0x${i.toString(16).padStart(4, '0')}`);
    }

    // 51st should fail
    expect(() => toggleFollow('0xAAA', '0xFFFF')).toThrow('MAX_FOLLOWED_EXCEEDED');
  });

  it('allows follow after unfollow when at limit', () => {
    for (let i = 0; i < 50; i++) {
      toggleFollow('0xAAA', `0x${i.toString(16).padStart(4, '0')}`);
    }

    // Unfollow one
    toggleFollow('0xAAA', '0x0000');
    // Now can follow a new one
    const result = toggleFollow('0xAAA', '0xFFFF');
    expect(result.following).toBe(true);
  });

  it('tracks follower count correctly across multiple followers', () => {
    toggleFollow('0xAAA', '0xTARGET');
    toggleFollow('0xBBB', '0xTARGET');
    toggleFollow('0xCCC', '0xTARGET');

    const result = toggleFollow('0xDDD', '0xTARGET');
    expect(result.followerCount).toBe(4);

    // Unfollow one
    const result2 = toggleFollow('0xBBB', '0xTARGET');
    expect(result2.following).toBe(false);
    expect(result2.followerCount).toBe(3);
  });
});

// ===== getFollowing =====

describe('getFollowing', () => {
  it('returns empty array for user with no follows', () => {
    expect(getFollowing('0xAAA')).toEqual([]);
  });

  it('returns all followed addresses', () => {
    toggleFollow('0xAAA', '0xBBB');
    toggleFollow('0xAAA', '0xCCC');
    toggleFollow('0xAAA', '0xDDD');

    const following = getFollowing('0xAAA');
    expect(following).toHaveLength(3);
    expect(new Set(following)).toEqual(new Set(['0xbbb', '0xccc', '0xddd']));
  });

  it('is case insensitive on address lookup', () => {
    toggleFollow('0xAAA', '0xBBB');
    expect(getFollowing('0xaaa')).toEqual(['0xbbb']);
    expect(getFollowing('0xAAA')).toEqual(['0xbbb']);
  });
});

// ===== getFollowerCounts =====

describe('getFollowerCounts', () => {
  it('returns empty map for empty input', () => {
    expect(getFollowerCounts([]).size).toBe(0);
  });

  it('returns 0 implicitly for users with no followers', () => {
    const counts = getFollowerCounts(['0xNOBODY']);
    expect(counts.get('0xnobody')).toBeUndefined(); // not in result set
  });

  it('counts correctly for multiple targets', () => {
    toggleFollow('0xA', '0xT1');
    toggleFollow('0xB', '0xT1');
    toggleFollow('0xC', '0xT1');
    toggleFollow('0xA', '0xT2');

    const counts = getFollowerCounts(['0xT1', '0xT2', '0xT3']);
    expect(counts.get('0xt1')).toBe(3);
    expect(counts.get('0xt2')).toBe(1);
    expect(counts.has('0xt3')).toBe(false);
  });
});

// ===== getFollowingCount =====

describe('getFollowingCount', () => {
  it('returns 0 for user not following anyone', () => {
    expect(getFollowingCount('0xAAA')).toBe(0);
  });

  it('counts correctly', () => {
    toggleFollow('0xAAA', '0xBBB');
    toggleFollow('0xAAA', '0xCCC');
    expect(getFollowingCount('0xAAA')).toBe(2);
  });

  it('decrements on unfollow', () => {
    toggleFollow('0xAAA', '0xBBB');
    toggleFollow('0xAAA', '0xCCC');
    toggleFollow('0xAAA', '0xBBB'); // unfollow
    expect(getFollowingCount('0xAAA')).toBe(1);
  });
});

// ===== Edge cases =====

describe('follow edge cases', () => {
  it('concurrent follows to same target are independent', () => {
    toggleFollow('0xA', '0xTARGET');
    toggleFollow('0xB', '0xTARGET');

    // Unfollow from A should not affect B
    toggleFollow('0xA', '0xTARGET');
    expect(getFollowing('0xA')).toEqual([]);
    expect(getFollowing('0xB')).toEqual(['0xtarget']);
  });

  it('toggle is idempotent (follow-unfollow-follow)', () => {
    toggleFollow('0xA', '0xB'); // follow
    toggleFollow('0xA', '0xB'); // unfollow
    const result = toggleFollow('0xA', '0xB'); // follow again
    expect(result.following).toBe(true);
    expect(result.followerCount).toBe(1);
  });

  it('handles addresses with mixed case consistently', () => {
    toggleFollow('0xAbC', '0xDeF');
    expect(getFollowing('0xabc')).toEqual(['0xdef']);
    expect(getFollowingCount('0xABC')).toBe(1);
  });
});
