/**
 * useChatTokenLease tests — cache hit/miss, lease pipeline, reLeaseCount
 * loop guard.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatTokenLease } from './useChatTokenLease';
import * as wakeClient from '../services/chatWakeClient';
import * as tokenStorage from '../services/chatTokenStorage';
import * as walletModule from '@nasun/wallet';

const WALLET = '0xa0a0';
const AGENT = '0xb0b0';
const CAP = '0xc0c0';

const SIGN_RESULT = { signature: 'SIG' };

function mockSigner(addr: string = WALLET) {
  const signer = {
    signPersonal: vi.fn().mockResolvedValue(SIGN_RESULT),
  };
  vi.spyOn(walletModule, 'useSigner').mockReturnValue({
    signer: signer as never,
    available: [],
    switchSigner: vi.fn(),
    address: addr,
    isConnected: true,
    signerType: 'local',
    hasSigner: () => true,
  });
  return signer;
}

let challengeSpy: ReturnType<typeof vi.spyOn>;
let sessionSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sessionStorage.clear();
  challengeSpy = vi.spyOn(wakeClient, 'postChatChallenge');
  sessionSpy = vi.spyOn(wakeClient, 'postChatSession');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useChatTokenLease cache', () => {
  it('returns cached token without signing', async () => {
    mockSigner();
    tokenStorage.saveToken({
      chatToken: 'CACHED',
      sid: 'SID',
      expiresAt: Date.now() + 9 * 60 * 1000,
      wallet: WALLET,
      agentAddress: AGENT,
      capabilityId: CAP,
    });

    const { result } = renderHook(() => useChatTokenLease());
    let leased: Awaited<ReturnType<typeof result.current.ensureToken>> | null = null;
    await act(async () => {
      leased = await result.current.ensureToken({
        wallet: WALLET,
        agentAddress: AGENT,
        capabilityId: CAP,
      });
    });
    expect(leased!.fresh).toBe(false);
    expect(leased!.token.chatToken).toBe('CACHED');
    expect(challengeSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('signs on cache miss', async () => {
    const signer = mockSigner();
    challengeSpy.mockResolvedValue({ challenge: 'CH', expiresAt: Date.now() + 60_000 });
    sessionSpy.mockResolvedValue({
      chatToken: 'FRESH',
      sid: 'SID',
      expiresAt: Date.now() + 10 * 60_000,
    });

    const { result } = renderHook(() => useChatTokenLease());
    let leased: Awaited<ReturnType<typeof result.current.ensureToken>> | null = null;
    await act(async () => {
      leased = await result.current.ensureToken({
        wallet: WALLET,
        agentAddress: AGENT,
        capabilityId: CAP,
      });
    });
    expect(leased!.fresh).toBe(true);
    expect(leased!.token.chatToken).toBe('FRESH');
    expect(signer.signPersonal).toHaveBeenCalledTimes(1);
    // /session must NOT include wallet — chat-server derives it from sig recovery.
    expect(sessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ challenge: 'CH', signature: 'SIG' }),
    );
    expect(sessionSpy.mock.calls[0][0]).not.toHaveProperty('wallet');
  });

  it('persists fresh token to sessionStorage with capability segment', async () => {
    mockSigner();
    const future = Date.now() + 10 * 60_000;
    challengeSpy.mockResolvedValue({ challenge: 'CH', expiresAt: 0 });
    sessionSpy.mockResolvedValue({ chatToken: 'FRESH', sid: 'SID', expiresAt: future });

    const { result } = renderHook(() => useChatTokenLease());
    await act(async () => {
      await result.current.ensureToken({
        wallet: WALLET,
        agentAddress: AGENT,
        capabilityId: CAP,
      });
    });
    // Reading with a different cap must miss — that's the R10 isolation.
    expect(tokenStorage.getToken(WALLET, AGENT, '0xOTHER')).toBeNull();
    expect(tokenStorage.getToken(WALLET, AGENT, CAP)?.chatToken).toBe('FRESH');
  });
});

describe('useChatTokenLease 401 loop guard', () => {
  it('allows exactly one re-lease', async () => {
    mockSigner();
    challengeSpy.mockResolvedValue({ challenge: 'CH', expiresAt: 0 });
    sessionSpy
      .mockResolvedValueOnce({ chatToken: 'T1', sid: 'S', expiresAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ chatToken: 'T2', sid: 'S', expiresAt: Date.now() + 60_000 });

    const { result } = renderHook(() => useChatTokenLease());
    await act(async () => {
      await result.current.ensureToken({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP });
    });
    // First 401 → re-lease succeeds.
    let secondLease: Awaited<ReturnType<typeof result.current.onTokenExpired>> | null = null;
    await act(async () => {
      secondLease = await result.current.onTokenExpired({
        wallet: WALLET,
        agentAddress: AGENT,
        capabilityId: CAP,
      });
    });
    expect(secondLease!.token.chatToken).toBe('T2');
  });

  it('rejects a second re-lease with client_reLease_exceeded', async () => {
    mockSigner();
    challengeSpy.mockResolvedValue({ challenge: 'CH', expiresAt: 0 });
    sessionSpy.mockResolvedValue({ chatToken: 'X', sid: 'S', expiresAt: Date.now() + 60_000 });

    const { result } = renderHook(() => useChatTokenLease());
    await act(async () => {
      await result.current.ensureToken({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP });
    });
    // First re-lease — passes.
    await act(async () => {
      await result.current.onTokenExpired({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP });
    });
    // Second re-lease — must throw.
    await expect(
      result.current.onTokenExpired({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP }),
    ).rejects.toMatchObject({
      code: 'client_reLease_exceeded',
      httpStatus: 401,
    });
  });

  it('resetReLease clears the counter (e.g. after a successful done)', async () => {
    mockSigner();
    challengeSpy.mockResolvedValue({ challenge: 'CH', expiresAt: 0 });
    sessionSpy.mockResolvedValue({ chatToken: 'X', sid: 'S', expiresAt: Date.now() + 60_000 });

    const { result } = renderHook(() => useChatTokenLease());
    await act(async () => {
      await result.current.ensureToken({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP });
    });
    await act(async () => {
      await result.current.onTokenExpired({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP });
    });
    // Reset, then allow another re-lease cycle.
    act(() => result.current.resetReLease());
    await act(async () => {
      await result.current.onTokenExpired({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP });
    });
    expect(sessionSpy).toHaveBeenCalledTimes(3); // initial + re-lease + reset+re-lease
  });
});

describe('useChatTokenLease wallet binding', () => {
  it('refuses to sign when connected wallet differs from requested', async () => {
    mockSigner('0xdead'); // signer connected to a different wallet
    const { result } = renderHook(() => useChatTokenLease());
    await expect(
      result.current.ensureToken({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP }),
    ).rejects.toThrow(/wallet_mismatch/);
    expect(challengeSpy).not.toHaveBeenCalled();
  });

  it('throws wallet_not_connected when no signer', async () => {
    vi.spyOn(walletModule, 'useSigner').mockReturnValue({
      signer: null,
      available: [],
      switchSigner: vi.fn(),
      address: null,
      isConnected: false,
      signerType: null,
      hasSigner: () => false,
    });
    const { result } = renderHook(() => useChatTokenLease());
    await expect(
      result.current.ensureToken({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP }),
    ).rejects.toThrow(/wallet_not_connected/);
  });

  it('surfaces a server 401 bad_signature as AgentChatApiError', async () => {
    mockSigner();
    challengeSpy.mockResolvedValue({ challenge: 'CH', expiresAt: 0 });
    sessionSpy.mockRejectedValue(
      new wakeClient.AgentChatApiError('bad_signature', 401),
    );
    const { result } = renderHook(() => useChatTokenLease());
    await expect(
      result.current.ensureToken({ wallet: WALLET, agentAddress: AGENT, capabilityId: CAP }),
    ).rejects.toMatchObject({ code: 'bad_signature', httpStatus: 401 });
  });
});
