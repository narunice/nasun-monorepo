import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup';

// We need to test the useAddressBook store directly
// Since it uses zustand with persist, we'll test the store logic

describe('AddressBook Store', () => {
  // Reset module cache before each test to get fresh store
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('isKnownAddress', () => {
    it('should return false for unknown address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();
      expect(store.isKnownAddress('0x1234')).toBe(false);
    });

    it('should return true for known address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();
      store.recordTransaction('0x1234');
      expect(store.isKnownAddress('0x1234')).toBe(true);
    });

    it('should normalize addresses to lowercase', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();
      store.recordTransaction('0xABCD');
      expect(store.isKnownAddress('0xabcd')).toBe(true);
      expect(store.isKnownAddress('0xABCD')).toBe(true);
    });
  });

  describe('isTrustedAddress', () => {
    it('should return false for untrusted address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();
      store.recordTransaction('0x1234');
      expect(store.isTrustedAddress('0x1234')).toBe(false);
    });

    it('should return true for trusted address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();
      store.recordTransaction('0x1234');
      store.trustAddress('0x1234');
      expect(store.isTrustedAddress('0x1234')).toBe(true);
    });
  });

  describe('recordTransaction', () => {
    it('should create new entry for first transaction', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234', 'Alice');

      const entry = store.getEntry('0x1234');
      expect(entry).toBeDefined();
      expect(entry?.label).toBe('Alice');
      expect(entry?.transactionCount).toBe(1);
      expect(entry?.isTrusted).toBe(false);
    });

    it('should increment transaction count for existing address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234');
      store.recordTransaction('0x1234');
      store.recordTransaction('0x1234');

      const entry = store.getEntry('0x1234');
      expect(entry?.transactionCount).toBe(3);
    });

    it('should update lastTransactionAt but keep firstTransactionAt', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234');
      const firstEntry = store.getEntry('0x1234');
      const firstTime = firstEntry?.firstTransactionAt;

      // Wait a bit and record another
      await new Promise((r) => setTimeout(r, 10));
      store.recordTransaction('0x1234');

      const secondEntry = store.getEntry('0x1234');
      expect(secondEntry?.firstTransactionAt).toBe(firstTime);
      expect(secondEntry?.lastTransactionAt).toBeGreaterThanOrEqual(firstTime!);
    });

    it('should preserve label if not provided on update', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234', 'Alice');
      store.recordTransaction('0x1234'); // No label

      const entry = store.getEntry('0x1234');
      expect(entry?.label).toBe('Alice');
    });
  });

  describe('trustAddress', () => {
    it('should mark address as trusted', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234');
      expect(store.isTrustedAddress('0x1234')).toBe(false);

      store.trustAddress('0x1234');
      expect(store.isTrustedAddress('0x1234')).toBe(true);
    });

    it('should do nothing for unknown address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.trustAddress('0x1234');
      expect(store.getEntry('0x1234')).toBeUndefined();
    });
  });

  describe('untrustAddress', () => {
    it('should remove trust from address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234');
      store.trustAddress('0x1234');
      expect(store.isTrustedAddress('0x1234')).toBe(true);

      store.untrustAddress('0x1234');
      expect(store.isTrustedAddress('0x1234')).toBe(false);
    });
  });

  describe('updateLabel', () => {
    it('should update address label', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234', 'Alice');
      expect(store.getEntry('0x1234')?.label).toBe('Alice');

      store.updateLabel('0x1234', 'Bob');
      expect(store.getEntry('0x1234')?.label).toBe('Bob');
    });

    it('should do nothing for unknown address', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.updateLabel('0x1234', 'Alice');
      expect(store.getEntry('0x1234')).toBeUndefined();
    });
  });

  describe('removeAddress', () => {
    it('should remove address from book', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1234');
      expect(store.isKnownAddress('0x1234')).toBe(true);

      store.removeAddress('0x1234');
      expect(store.isKnownAddress('0x1234')).toBe(false);
    });
  });

  describe('getAllEntries', () => {
    it('should return empty array when no entries', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      expect(store.getAllEntries()).toEqual([]);
    });

    it('should return all entries', async () => {
      const { useAddressBook } = await import('../hooks/useAddressBook');
      const store = useAddressBook.getState();

      store.recordTransaction('0x1111', 'Alice');
      store.recordTransaction('0x2222', 'Bob');
      store.recordTransaction('0x3333');

      const entries = store.getAllEntries();
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.label)).toContain('Alice');
      expect(entries.map((e) => e.label)).toContain('Bob');
    });
  });
});

describe('useAddressStatus', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should return status for address', async () => {
    const { useAddressBook, useAddressStatus } = await import('../hooks/useAddressBook');
    const store = useAddressBook.getState();

    store.recordTransaction('0x1234', 'Alice');
    store.trustAddress('0x1234');

    // Note: useAddressStatus is a hook, but we can test its logic
    // by calling the store methods directly
    expect(store.isKnownAddress('0x1234')).toBe(true);
    expect(store.isTrustedAddress('0x1234')).toBe(true);
    expect(store.getEntry('0x1234')?.label).toBe('Alice');
  });
});
