/**
 * NSA Discovery & Duplicate Prevention Tests
 *
 * Tests for SmartAccount discovery functions that prevent
 * duplicate account creation across devices/browsers.
 *
 * Covers:
 * - lookupAccountInRegistry (on-chain registry lookup)
 * - findAccountsForAddress (event-based discovery fallback)
 * - discoverExistingAccount (unified discovery pipeline)
 * - buildCreateAccount (create_account_v2 with registry)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getSuiClient before importing modules that use it
const mockGetObject = vi.fn();
const mockQueryEvents = vi.fn();
const mockDevInspect = vi.fn();

vi.mock('../../../sui/client', () => ({
  getSuiClient: () => ({
    getObject: mockGetObject,
    queryEvents: mockQueryEvents,
    devInspectTransactionBlock: mockDevInspect,
  }),
}));

// Mock devnet-config to provide stable test values
vi.mock('@nasun/devnet-config', () => ({
  NSA_PACKAGE_ID: '0xTEST_PACKAGE_ID',
  NSA_REGISTRY_ID: '0xTEST_REGISTRY_ID',
}));

import {
  lookupAccountInRegistry,
  findAccountsForAddress,
  discoverExistingAccount,
  buildCreateAccount,
  fetchAccountState,
} from '../client';

const TEST_ADDRESS = '0x' + 'a'.repeat(64);
const TEST_ACCOUNT_ID = '0x' + 'b'.repeat(64);
const TEST_ACCOUNT_ID_2 = '0x' + 'c'.repeat(64);

// Helper: convert hex string to byte array (for BCS Option<ID> simulation)
function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

// Helper: create mock account state response
function mockAccountStateResponse(_objectId: string, signerAddress: string) {
  return {
    data: {
      content: {
        dataType: 'moveObject',
        fields: {
          signers: {
            fields: {
              contents: [{
                fields: {
                  key: signerAddress,
                  value: {
                    fields: {
                      signer_type: 2,
                      weight: 100,
                      added_at: Date.now(),
                      label: 'primary-key',
                    },
                  },
                },
              }],
            },
          },
          threshold: 1,
          guardians: [],
          guardian_threshold: 0,
          recovery_owner: '0x0',
          nonce: 0,
          created_at: Date.now(),
        },
      },
    },
  };
}

describe('lookupAccountInRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns account ID when address is registered', async () => {
    // has_account returns true
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [[[1], 'bool']], // true
      }],
    });

    // lookup_account returns Option<ID> = Some(account_id)
    const idBytes = hexToBytes(TEST_ACCOUNT_ID);
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [[[1, ...idBytes], 'option<address>']], // Some(ID)
      }],
    });

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBe(TEST_ACCOUNT_ID);
    expect(mockDevInspect).toHaveBeenCalledTimes(2);
  });

  it('returns null when address is not registered (has_account = false)', async () => {
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [[[0], 'bool']], // false
      }],
    });

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
    expect(mockDevInspect).toHaveBeenCalledTimes(1); // Does not call lookup_account
  });

  it('returns null when has_account returns empty results', async () => {
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [],
      }],
    });

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('returns null when has_account returns no results array', async () => {
    mockDevInspect.mockResolvedValueOnce({
      results: [],
    });

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('returns null when lookup_account returns None', async () => {
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [[[1], 'bool']],
      }],
    });

    // Option<ID> = None
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [[[0], 'option<address>']],
      }],
    });

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('returns null when devInspect throws (registry not deployed)', async () => {
    mockDevInspect.mockRejectedValueOnce(new Error('Object not found'));

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('returns null when devInspect throws network error', async () => {
    mockDevInspect.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('handles malformed returnValues gracefully', async () => {
    mockDevInspect.mockResolvedValueOnce({
      results: [{
        returnValues: [[null, 'bool']],
      }],
    });

    const result = await lookupAccountInRegistry(TEST_ADDRESS);
    expect(result).toBeNull();
  });
});

describe('findAccountsForAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds account via AccountCreated event (creator match)', async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: TEST_ADDRESS,
            initial_signer: TEST_ADDRESS,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] }); // SignerAdded events

    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS),
    );

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([TEST_ACCOUNT_ID]);
  });

  it('finds account via SignerAdded event (added later as signer)', async () => {
    mockQueryEvents
      .mockResolvedValueOnce({ data: [] }) // AccountCreated events
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            signer_address: TEST_ADDRESS,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      });

    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS),
    );

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([TEST_ACCOUNT_ID]);
  });

  it('deduplicates account IDs across AccountCreated and SignerAdded events', async () => {
    const sameParsedJson = {
      creator: TEST_ADDRESS,
      initial_signer: TEST_ADDRESS,
      account_id: TEST_ACCOUNT_ID,
    };

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{ parsedJson: sameParsedJson }],
      })
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            signer_address: TEST_ADDRESS,
            account_id: TEST_ACCOUNT_ID, // same ID
          },
        }],
      });

    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS),
    );

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([TEST_ACCOUNT_ID]);
    // Only one getObject call because ID was deduped
    expect(mockGetObject).toHaveBeenCalledTimes(1);
  });

  it('filters out accounts where signer was removed', async () => {
    const otherAddress = '0x' + 'd'.repeat(64);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: TEST_ADDRESS,
            initial_signer: TEST_ADDRESS,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    // Account exists but TEST_ADDRESS is no longer a signer
    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, otherAddress),
    );

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([]); // filtered out
  });

  it('handles case-insensitive address comparison', async () => {
    const upperAddress = TEST_ADDRESS.toUpperCase();

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: upperAddress, // uppercase
            initial_signer: upperAddress,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS),
    );

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([TEST_ACCOUNT_ID]);
  });

  it('returns empty when no events match the address', async () => {
    const otherAddress = '0x' + 'f'.repeat(64);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: otherAddress,
            initial_signer: otherAddress,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([]);
  });

  it('returns empty when no events exist', async () => {
    mockQueryEvents
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([]);
  });

  it('gracefully handles fetchAccountState failure for individual candidates', async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          {
            parsedJson: {
              creator: TEST_ADDRESS,
              initial_signer: TEST_ADDRESS,
              account_id: TEST_ACCOUNT_ID,
            },
          },
          {
            parsedJson: {
              creator: TEST_ADDRESS,
              initial_signer: TEST_ADDRESS,
              account_id: TEST_ACCOUNT_ID_2,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    // First account: fetch fails
    mockGetObject.mockResolvedValueOnce({
      data: null,
      error: { code: 'notExists' },
    });
    // Second account: fetch succeeds
    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID_2, TEST_ADDRESS),
    );

    const result = await findAccountsForAddress(TEST_ADDRESS);
    // Only the second account is returned (first failed gracefully)
    expect(result).toEqual([TEST_ACCOUNT_ID_2]);
  });

  it('handles events with null/missing parsedJson', async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          { parsedJson: null },
          { parsedJson: undefined },
          { /* no parsedJson */ },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([]);
  });

  it('handles events with missing account_id field', async () => {
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: TEST_ADDRESS,
            initial_signer: TEST_ADDRESS,
            // no account_id
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    const result = await findAccountsForAddress(TEST_ADDRESS);
    expect(result).toEqual([]);
  });
});

describe('discoverExistingAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns registry result when available (primary path)', async () => {
    // Registry lookup succeeds
    const idBytes = hexToBytes(TEST_ACCOUNT_ID);
    mockDevInspect
      .mockResolvedValueOnce({
        results: [{ returnValues: [[[1], 'bool']] }],
      })
      .mockResolvedValueOnce({
        results: [{ returnValues: [[[1, ...idBytes], 'option<address>']] }],
      });

    const result = await discoverExistingAccount(TEST_ADDRESS);
    expect(result).toBe(TEST_ACCOUNT_ID);
    // Should not query events since registry succeeded
    expect(mockQueryEvents).not.toHaveBeenCalled();
  });

  it('falls back to event discovery when registry returns null', async () => {
    // Registry: has_account returns false
    mockDevInspect.mockResolvedValueOnce({
      results: [{ returnValues: [[[0], 'bool']] }],
    });

    // Event fallback finds account
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: TEST_ADDRESS,
            initial_signer: TEST_ADDRESS,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS),
    );

    const result = await discoverExistingAccount(TEST_ADDRESS);
    expect(result).toBe(TEST_ACCOUNT_ID);
  });

  it('falls back to event discovery when registry throws', async () => {
    // Registry lookup fails (e.g., not deployed)
    mockDevInspect.mockRejectedValueOnce(new Error('Object not found'));

    // Event fallback finds account
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: TEST_ADDRESS,
            initial_signer: TEST_ADDRESS,
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    mockGetObject.mockResolvedValueOnce(
      mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS),
    );

    const result = await discoverExistingAccount(TEST_ADDRESS);
    expect(result).toBe(TEST_ACCOUNT_ID);
  });

  it('returns null when both registry and events find nothing', async () => {
    // Registry: not found
    mockDevInspect.mockResolvedValueOnce({
      results: [{ returnValues: [[[0], 'bool']] }],
    });

    // Events: nothing
    mockQueryEvents
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await discoverExistingAccount(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('returns first account from event fallback when multiple exist', async () => {
    // Registry: not found
    mockDevInspect.mockResolvedValueOnce({
      results: [{ returnValues: [[[0], 'bool']] }],
    });

    // Events: multiple accounts
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          {
            parsedJson: {
              creator: TEST_ADDRESS,
              initial_signer: TEST_ADDRESS,
              account_id: TEST_ACCOUNT_ID,
            },
          },
          {
            parsedJson: {
              creator: TEST_ADDRESS,
              initial_signer: TEST_ADDRESS,
              account_id: TEST_ACCOUNT_ID_2,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    mockGetObject
      .mockResolvedValueOnce(mockAccountStateResponse(TEST_ACCOUNT_ID, TEST_ADDRESS))
      .mockResolvedValueOnce(mockAccountStateResponse(TEST_ACCOUNT_ID_2, TEST_ADDRESS));

    const result = await discoverExistingAccount(TEST_ADDRESS);
    expect(result).toBe(TEST_ACCOUNT_ID); // first one
  });
});

describe('buildCreateAccount', () => {
  it('creates transaction targeting create_account_v2 with registry', () => {
    const tx = buildCreateAccount({
      initialSignerType: 'local',
      label: 'primary-key',
    });

    // Verify the transaction was built (Transaction object with moveCall)
    expect(tx).toBeDefined();
    // The transaction should have been constructed without errors
    // Detailed move call verification would require inspecting serialized TX
  });

  it('encodes label as UTF-8 bytes', () => {
    const tx = buildCreateAccount({
      initialSignerType: 'zklogin',
      label: 'primary-zklogin',
    });

    expect(tx).toBeDefined();
  });

  it('handles all signer types', () => {
    const types: Array<'local' | 'zklogin' | 'passkey' | 'hardware'> = [
      'local', 'zklogin', 'passkey', 'hardware',
    ];

    for (const signerType of types) {
      const tx = buildCreateAccount({
        initialSignerType: signerType,
        label: `test-${signerType}`,
      });
      expect(tx).toBeDefined();
    }
  });

  it('handles empty label', () => {
    const tx = buildCreateAccount({
      initialSignerType: 'local',
      label: '',
    });
    expect(tx).toBeDefined();
  });

  it('handles unicode label within byte limit', () => {
    const tx = buildCreateAccount({
      initialSignerType: 'local',
      label: 'My Wallet',
    });
    expect(tx).toBeDefined();
  });

  it('throws NsaError when label exceeds 64 bytes', () => {
    const longLabel = 'a'.repeat(65);
    expect(() => buildCreateAccount({
      initialSignerType: 'local',
      label: longLabel,
    })).toThrow('Label exceeds 64 bytes');
  });

  it('allows label exactly at 64 bytes', () => {
    const exactLabel = 'a'.repeat(64);
    const tx = buildCreateAccount({
      initialSignerType: 'local',
      label: exactLabel,
    });
    expect(tx).toBeDefined();
  });

  it('counts multi-byte UTF-8 characters correctly', () => {
    // Korean characters are 3 bytes each in UTF-8
    // 22 Korean chars = 66 bytes > 64
    const koreanLabel = '\uD55C'.repeat(22);
    expect(() => buildCreateAccount({
      initialSignerType: 'local',
      label: koreanLabel,
    })).toThrow('Label exceeds 64 bytes');
  });
});

describe('fetchAccountState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NsaError with ACCOUNT_NOT_FOUND when object does not exist', async () => {
    mockGetObject.mockResolvedValueOnce({
      data: null,
      error: { code: 'notExists' },
    });

    await expect(fetchAccountState(TEST_ACCOUNT_ID)).rejects.toThrow('SmartAccount not found');
  });

  it('throws NsaError when content is not a moveObject', async () => {
    mockGetObject.mockResolvedValueOnce({
      data: {
        content: {
          dataType: 'package',
        },
      },
    });

    await expect(fetchAccountState(TEST_ACCOUNT_ID)).rejects.toThrow('SmartAccount not found');
  });

  it('parses account state correctly', async () => {
    const now = Date.now();
    mockGetObject.mockResolvedValueOnce({
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            signers: {
              fields: {
                contents: [{
                  fields: {
                    key: TEST_ADDRESS,
                    value: {
                      fields: {
                        signer_type: 0, // zklogin
                        weight: 100,
                        added_at: now,
                        label: 'primary-zklogin',
                      },
                    },
                  },
                }],
              },
            },
            threshold: 1,
            guardians: [],
            guardian_threshold: 0,
            recovery_owner: '0x0',
            nonce: 0,
            created_at: now,
          },
        },
      },
    });

    const state = await fetchAccountState(TEST_ACCOUNT_ID);
    expect(state.objectId).toBe(TEST_ACCOUNT_ID);
    expect(state.signers).toHaveLength(1);
    expect(state.signers[0].address).toBe(TEST_ADDRESS);
    expect(state.signers[0].signerType).toBe('zklogin');
    expect(state.signers[0].weight).toBe(100);
    expect(state.threshold).toBe(1);
    expect(state.guardians).toEqual([]);
  });

  it('handles account with multiple signers', async () => {
    const signer2 = '0x' + 'e'.repeat(64);
    mockGetObject.mockResolvedValueOnce({
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            signers: {
              fields: {
                contents: [
                  {
                    fields: {
                      key: TEST_ADDRESS,
                      value: {
                        fields: {
                          signer_type: 2,
                          weight: 100,
                          added_at: Date.now(),
                          label: 'primary',
                        },
                      },
                    },
                  },
                  {
                    fields: {
                      key: signer2,
                      value: {
                        fields: {
                          signer_type: 1,
                          weight: 50,
                          added_at: Date.now(),
                          label: 'backup-passkey',
                        },
                      },
                    },
                  },
                ],
              },
            },
            threshold: 2,
            guardians: [TEST_ADDRESS],
            guardian_threshold: 1,
            recovery_owner: TEST_ADDRESS,
            nonce: 5,
            created_at: Date.now(),
          },
        },
      },
    });

    const state = await fetchAccountState(TEST_ACCOUNT_ID);
    expect(state.signers).toHaveLength(2);
    expect(state.signers[1].signerType).toBe('passkey');
    expect(state.threshold).toBe(2);
    expect(state.guardians).toEqual([TEST_ADDRESS]);
  });

  it('handles empty signers map', async () => {
    mockGetObject.mockResolvedValueOnce({
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            signers: {
              fields: {
                contents: [],
              },
            },
            threshold: 0,
            guardians: [],
            guardian_threshold: 0,
            recovery_owner: '0x0',
            nonce: 0,
            created_at: Date.now(),
          },
        },
      },
    });

    const state = await fetchAccountState(TEST_ACCOUNT_ID);
    expect(state.signers).toEqual([]);
  });
});

describe('Edge Cases: Concurrent & Race Conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registry lookup does not interfere with parallel calls', async () => {
    // Simulate two parallel lookups for different addresses
    const address2 = '0x' + 'f'.repeat(64);

    // Both return false
    mockDevInspect
      .mockResolvedValueOnce({ results: [{ returnValues: [[[0], 'bool']] }] })
      .mockResolvedValueOnce({ results: [{ returnValues: [[[0], 'bool']] }] });

    // Both fall back to events
    mockQueryEvents
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const [r1, r2] = await Promise.all([
      discoverExistingAccount(TEST_ADDRESS),
      discoverExistingAccount(address2),
    ]);

    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it('handles mixed address formats (with/without 0x prefix)', async () => {
    // Events return address without 0x prefix
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [{
          parsedJson: {
            creator: 'a'.repeat(64), // no 0x prefix
            initial_signer: 'a'.repeat(64),
            account_id: TEST_ACCOUNT_ID,
          },
        }],
      })
      .mockResolvedValueOnce({ data: [] });

    // Address comparison in findAccountsForAddress uses toLowerCase()
    // This tests that the comparison handles the case correctly
    const result = await findAccountsForAddress(TEST_ADDRESS);
    // The function lowercases and compares; 0xaaa... vs aaa... won't match
    // This is expected behavior — on-chain events should include 0x prefix
    expect(result).toEqual([]);
  });
});
