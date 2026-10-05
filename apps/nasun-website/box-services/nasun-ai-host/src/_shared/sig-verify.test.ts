/**
 * sig-verify tests.
 *
 * Uses a real Ed25519Keypair to produce signatures and verifies that
 * Lambda-side canonicalization + verifyPersonalMessageSignature recovers
 * the correct address. Failure modes are checked by mutating the signed
 * fields or swapping the expected address.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { canonicalSettle, verifySettleSig, type SettleSigFields } from './sig-verify';

let agentKeypair: Ed25519Keypair;
let agentAddress: string;

beforeAll(() => {
  agentKeypair = new Ed25519Keypair();
  agentAddress = agentKeypair.toSuiAddress();
});

function makeFields(overrides: Partial<SettleSigFields> = {}): SettleSigFields {
  return {
    v: 1,
    kind: 'nasun-ai-settle',
    requestId: '42',
    promptHash: '0x' + 'a'.repeat(64),
    resultHash: '0x' + 'b'.repeat(64),
    agentAddress,
    principalAddress: agentAddress,
    capabilityId: '0xcafe',
    expectedCapabilityVersion: '7',
    envelopeHash: '0x' + 'c'.repeat(64),
    actionCallHash: '0x' + '00'.repeat(32),
    ...overrides,
  };
}

async function sign(fields: SettleSigFields): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSettle(fields));
  const { signature } = await agentKeypair.signPersonalMessage(bytes);
  return signature;
}

describe('canonicalSettle', () => {
  it('produces a fixed-order pipe-delimited string', () => {
    const s = canonicalSettle(makeFields());
    const parts = s.split('|');
    expect(parts).toHaveLength(11);
    expect(parts[0]).toBe('1');
    expect(parts[1]).toBe('nasun-ai-settle');
    expect(parts[2]).toBe('42');
  });

  it('lowercases hex fields', () => {
    const s = canonicalSettle(makeFields({
      promptHash: '0x' + 'A'.repeat(64),
    }));
    expect(s).toContain('0x' + 'a'.repeat(64));
    expect(s).not.toContain('0xA');
  });
});

describe('verifySettleSig', () => {
  it('accepts a valid signature with matching agent address', async () => {
    const fields = makeFields();
    const sig = await sign(fields);
    const res = await verifySettleSig(fields, sig, agentAddress);
    expect(res.ok).toBe(true);
  });

  it('rejects when the expected agent address differs from the signer', async () => {
    const fields = makeFields();
    const sig = await sign(fields);
    const otherAddress = new Ed25519Keypair().toSuiAddress();
    const res = await verifySettleSig(fields, sig, otherAddress);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(['signature_address_mismatch', 'invalid_signature']).toContain(res.reason);
    }
  });

  it('rejects when a signed field is mutated after signing', async () => {
    const fields = makeFields();
    const sig = await sign(fields);
    const tampered = { ...fields, resultHash: '0x' + 'f'.repeat(64) };
    const res = await verifySettleSig(tampered, sig, agentAddress);
    expect(res.ok).toBe(false);
  });

  it('rejects a malformed base64 signature', async () => {
    const fields = makeFields();
    const res = await verifySettleSig(fields, 'not-a-real-sig', agentAddress);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_signature');
  });

  it('rejects when actionCallHash is wrong length', async () => {
    const fields = makeFields({ actionCallHash: '0xabcd' });
    const sig = await sign(fields);
    const res = await verifySettleSig(fields, sig, agentAddress);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_field');
  });

  it('rejects when requestId is not a decimal u64', async () => {
    const fields = makeFields({ requestId: 'NaN' });
    const sig = await sign(fields);
    const res = await verifySettleSig(fields, sig, agentAddress);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_field');
  });

  it('case-insensitive comparison of the expected agent address', async () => {
    const fields = makeFields();
    const sig = await sign(fields);
    const res = await verifySettleSig(fields, sig, agentAddress.toUpperCase());
    expect(res.ok).toBe(true);
  });
});
