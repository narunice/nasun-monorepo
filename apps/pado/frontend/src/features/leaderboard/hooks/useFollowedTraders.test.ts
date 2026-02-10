/**
 * useFollowedTraders Hook Tests
 * Tests localStorage-based trader following with edge cases.
 *
 * Note: localStorage is mocked globally in __tests__/setup.ts.
 * The mock clears before each test and provides spy functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFollowedTraders, _resetForTesting } from './useFollowedTraders';

const STORAGE_KEY = 'pado-followed-traders';

beforeEach(() => {
  _resetForTesting();
});

// ========================================
// Basic Operations
// ========================================

describe('useFollowedTraders — basic operations', () => {
  it('returns empty array by default', () => {
    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
    expect(result.current.followCount).toBe(0);
  });

  it('toggleFollow adds an address', () => {
    const { result } = renderHook(() => useFollowedTraders());
    const addr = '0x' + 'a'.repeat(64);

    act(() => result.current.toggleFollow(addr));

    expect(result.current.followedAddresses).toContain(addr);
    expect(result.current.followCount).toBe(1);
    expect(result.current.isFollowing(addr)).toBe(true);
  });

  it('toggleFollow removes an already-followed address', () => {
    const { result } = renderHook(() => useFollowedTraders());
    const addr = '0x' + 'b'.repeat(64);

    act(() => result.current.toggleFollow(addr));
    expect(result.current.isFollowing(addr)).toBe(true);

    act(() => result.current.toggleFollow(addr));
    expect(result.current.isFollowing(addr)).toBe(false);
    expect(result.current.followCount).toBe(0);
  });

  it('can follow multiple addresses', () => {
    const { result } = renderHook(() => useFollowedTraders());
    const addr1 = '0x' + '1'.repeat(64);
    const addr2 = '0x' + '2'.repeat(64);
    const addr3 = '0x' + '3'.repeat(64);

    act(() => {
      result.current.toggleFollow(addr1);
    });
    act(() => {
      result.current.toggleFollow(addr2);
    });
    act(() => {
      result.current.toggleFollow(addr3);
    });

    expect(result.current.followCount).toBe(3);
    expect(result.current.isFollowing(addr1)).toBe(true);
    expect(result.current.isFollowing(addr2)).toBe(true);
    expect(result.current.isFollowing(addr3)).toBe(true);
  });

  it('isFollowing returns false for unfollowed address', () => {
    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.isFollowing('0x' + 'z'.repeat(64))).toBe(false);
  });
});

// ========================================
// localStorage Persistence
// ========================================

describe('useFollowedTraders — localStorage persistence', () => {
  it('writes to localStorage on follow', () => {
    const { result } = renderHook(() => useFollowedTraders());
    const addr = '0x' + 'c'.repeat(64);

    act(() => result.current.toggleFollow(addr));

    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify([addr])
    );
  });

  it('reads existing data from localStorage on mount', () => {
    const addr = '0x' + 'd'.repeat(64);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([addr]));

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toContain(addr);
    expect(result.current.isFollowing(addr)).toBe(true);
  });

  it('handles empty localStorage gracefully', () => {
    // localStorage is already cleared by setup.ts beforeEach
    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });
});

// ========================================
// Max Follow Cap (50)
// ========================================

describe('useFollowedTraders — max follow cap', () => {
  it('does not add beyond 50 addresses', () => {
    // Pre-populate localStorage with 50 addresses
    const existing = Array.from({ length: 50 }, (_, i) =>
      '0x' + i.toString(16).padStart(64, '0')
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useFollowedTraders());
    const newAddr = '0x' + 'f'.repeat(64);

    act(() => result.current.toggleFollow(newAddr));

    // Should still be 50, not 51
    expect(result.current.followCount).toBe(50);
    expect(result.current.isFollowing(newAddr)).toBe(false);
  });

  it('allows removing when at cap, then re-adding', () => {
    const existing = Array.from({ length: 50 }, (_, i) =>
      '0x' + i.toString(16).padStart(64, '0')
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useFollowedTraders());

    // Remove one
    act(() => result.current.toggleFollow(existing[0]));
    expect(result.current.followCount).toBe(49);

    // Now we can add a new one
    const newAddr = '0x' + 'f'.repeat(64);
    act(() => result.current.toggleFollow(newAddr));
    expect(result.current.followCount).toBe(50);
    expect(result.current.isFollowing(newAddr)).toBe(true);
  });
});

// ========================================
// localStorage Corruption / Poisoning (HIGH-3)
// ========================================

describe('useFollowedTraders — localStorage corruption resistance', () => {
  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, '{invalid json!!!');

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
    expect(result.current.followCount).toBe(0);
  });

  it('handles non-array JSON value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ malicious: true }));

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });

  it('handles JSON string value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('just a string'));

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });

  it('handles JSON number value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(42));

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });

  it('handles JSON null value', () => {
    localStorage.setItem(STORAGE_KEY, 'null');

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });

  it('filters out non-string elements from array', () => {
    // Array with mixed types — only strings should survive
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      '0x' + 'a'.repeat(64),
      123,
      null,
      true,
      { address: '0x123' },
      '0x' + 'b'.repeat(64),
    ]));

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([
      '0x' + 'a'.repeat(64),
      '0x' + 'b'.repeat(64),
    ]);
    expect(result.current.followCount).toBe(2);
  });

  it('truncates oversized array from localStorage to MAX_FOLLOWED', () => {
    // Write 100 addresses directly to localStorage (bypassing the cap)
    const oversized = Array.from({ length: 100 }, (_, i) =>
      '0x' + i.toString(16).padStart(64, '0')
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oversized));

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followCount).toBe(50); // Capped at MAX_FOLLOWED
  });

  it('handles empty string in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '');

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });

  it('handles empty array in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '[]');

    const { result } = renderHook(() => useFollowedTraders());
    expect(result.current.followedAddresses).toEqual([]);
  });
});

// ========================================
// Multiple Hook Instances
// ========================================

describe('useFollowedTraders — multiple instances', () => {
  it('multiple hook instances share the same state', () => {
    const { result: hook1 } = renderHook(() => useFollowedTraders());
    const { result: hook2 } = renderHook(() => useFollowedTraders());

    const addr = '0x' + 'e'.repeat(64);
    act(() => hook1.current.toggleFollow(addr));

    // hook2 should see the same state (shared localStorage + cache)
    expect(hook2.current.isFollowing(addr)).toBe(true);
  });
});
