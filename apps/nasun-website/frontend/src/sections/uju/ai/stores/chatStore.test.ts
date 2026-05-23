/**
 * chatStore.createSession contract — verifies the wake-mode invariants:
 * agent sessions must carry a capabilityId, generic sessions are the
 * default for callers that don't specify a kind.
 *
 * IndexedDB writes inside the store fire-and-forget (catch -> warn), so we
 * can run these without fake-indexeddb. Errors land in console.warn rather
 * than rejecting the action.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';

const WALLET = '0xa0a0';
const AGENT = '0xb0b0';
const CAP = '0xc0c0';

beforeEach(() => {
  useChatStore.getState().reset();
  // Seed walletAddress + defaultAgentId so createSession can resolve a
  // billing agent without invoking load() (which would touch IndexedDB).
  useChatStore.setState({
    walletAddress: WALLET,
    agentId: null,
    defaultAgentId: AGENT,
  });
});

describe('createSession kind defaulting', () => {
  it('defaults to generic when no opts supplied', async () => {
    const id = await useChatStore.getState().createSession();
    const session = useChatStore.getState().sessions.find((s) => s.id === id);
    expect(session?.sessionKind).toBe('generic');
    expect(session?.capabilityId).toBeUndefined();
  });

  it('honors explicit generic kind', async () => {
    const id = await useChatStore.getState().createSession({ kind: 'generic' });
    const session = useChatStore.getState().sessions.find((s) => s.id === id);
    expect(session?.sessionKind).toBe('generic');
  });
});

describe('createSession agent-kind invariants', () => {
  it('records capabilityId on agent sessions', async () => {
    const id = await useChatStore
      .getState()
      .createSession({ kind: 'agent', capabilityId: CAP });
    const session = useChatStore.getState().sessions.find((s) => s.id === id);
    expect(session?.sessionKind).toBe('agent');
    expect(session?.capabilityId).toBe(CAP);
  });

  it('rejects agent-kind without capabilityId (R10 invariant)', async () => {
    // Wake-mode token storage keys include capabilityId; creating an agent
    // session without one would make the inflight chatToken un-resolvable.
    await expect(
      useChatStore.getState().createSession({ kind: 'agent' }),
    ).rejects.toThrow(/capabilityId required/);
  });

  it('rejects when no wallet is loaded', async () => {
    useChatStore.setState({ walletAddress: null });
    await expect(
      useChatStore.getState().createSession({ kind: 'agent', capabilityId: CAP }),
    ).rejects.toThrow(/Wallet not loaded/);
  });

  it('rejects when no agent is selected', async () => {
    useChatStore.setState({ defaultAgentId: null });
    await expect(useChatStore.getState().createSession()).rejects.toThrow(
      /No agent selected/,
    );
  });
});

describe('createSession agent override', () => {
  it('opts.agentId overrides defaultAgentId', async () => {
    const id = await useChatStore.getState().createSession({ agentId: '0xother' });
    const session = useChatStore.getState().sessions.find((s) => s.id === id);
    expect(session?.agentId).toBe('0xother');
  });
});
