/**
 * Settlement signature verification for the trader heartbeat path.
 *
 * The runtime's agent keypair signs a fixed-order, pipe-delimited canonical
 * string covering every settlement-binding field. /execute-capability
 * recomputes the same canonical bytes and runs
 * `verifyPersonalMessageSignature({ address })` (the prod-validated pattern
 * already in use for /result wallet binding at index.ts:290).
 *
 * Fixed-order concat is chosen over JSON canonicalization to avoid the usual
 * traps (undefined keys, escaping, key ordering, Unicode). Field order MUST
 * stay in lockstep with the runtime's `signSettle()` in
 * apps/nasun-ai-runtime/src/sig.ts.
 */

import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

export interface SettleSigFields {
  v: 1;
  kind: 'nasun-ai-settle';
  requestId: string;                  // u64 decimal
  promptHash: string;                 // 0x<64 hex lower>
  resultHash: string;                 // 0x<64 hex lower>
  agentAddress: string;               // 0x<64 hex lower>  -- sig recover target
  principalAddress: string;           // 0x<64 hex lower>  -- cap.owner
  capabilityId: string;               // 0x<hex lower>
  expectedCapabilityVersion: string;  // u64 decimal
  envelopeHash: string;               // 0x<64 hex lower>  sha256(canonical envelope JSON)
  actionCallHash: string;             // 0x<64 hex lower>  sha256(actionCall||spend||escrow) or zero-bytes (PR1.A)
}

const HEX32 = /^0x[0-9a-f]{64}$/;
const HEX_ANY = /^0x[0-9a-f]{1,64}$/;
const U64_DECIMAL = /^[0-9]+$/;

/**
 * Build the canonical signing string. MUST match the runtime byte-for-byte.
 */
export function canonicalSettle(f: SettleSigFields): string {
  return [
    String(f.v),
    f.kind,
    f.requestId,
    f.promptHash.toLowerCase(),
    f.resultHash.toLowerCase(),
    f.agentAddress.toLowerCase(),
    f.principalAddress.toLowerCase(),
    f.capabilityId.toLowerCase(),
    f.expectedCapabilityVersion,
    f.envelopeHash.toLowerCase(),
    f.actionCallHash.toLowerCase(),
  ].join('|');
}

/**
 * Defense-in-depth field shape validation so an invalid hex/decimal doesn't
 * bypass via a string slot.
 */
function validateFields(f: SettleSigFields): string | null {
  if (f.v !== 1) return 'v_must_be_1';
  if (f.kind !== 'nasun-ai-settle') return 'kind_must_be_settle';
  if (!U64_DECIMAL.test(f.requestId)) return 'requestId_not_u64_decimal';
  const lowerPromptHash = f.promptHash.toLowerCase();
  if (!HEX32.test(lowerPromptHash)) return 'promptHash_not_32_hex';
  const lowerResultHash = f.resultHash.toLowerCase();
  if (!HEX32.test(lowerResultHash)) return 'resultHash_not_32_hex';
  if (!HEX32.test(f.agentAddress.toLowerCase())) return 'agentAddress_not_32_hex';
  if (!HEX32.test(f.principalAddress.toLowerCase())) return 'principalAddress_not_32_hex';
  if (!HEX_ANY.test(f.capabilityId.toLowerCase())) return 'capabilityId_not_hex';
  if (!U64_DECIMAL.test(f.expectedCapabilityVersion)) return 'expectedCapabilityVersion_not_u64_decimal';
  if (!HEX32.test(f.envelopeHash.toLowerCase())) return 'envelopeHash_not_32_hex';
  if (!HEX32.test(f.actionCallHash.toLowerCase())) return 'actionCallHash_not_32_hex';
  return null;
}

export type SettleSigVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_signature' | 'signature_address_mismatch' | 'invalid_field' };

/**
 * Verify a settlement signature.
 *
 * Uses the SDK's option-form `{ address }` (index.ts:290 pattern). The SDK
 * throws on either signature corruption or address recovery mismatch; we
 * disambiguate via the thrown message so the caller can return a precise
 * `reason` (debugging-friendly, no security uplift).
 */
export async function verifySettleSig(
  fields: SettleSigFields,
  sigB64: string,
  expectedAgentAddress: string,
): Promise<SettleSigVerifyResult> {
  const fieldErr = validateFields(fields);
  if (fieldErr) return { ok: false, reason: 'invalid_field' };
  if (typeof sigB64 !== 'string' || sigB64.length < 16 || sigB64.length > 512) {
    return { ok: false, reason: 'invalid_signature' };
  }
  try {
    const msgBytes = new TextEncoder().encode(canonicalSettle(fields));
    await verifyPersonalMessageSignature(msgBytes, sigB64, {
      address: expectedAgentAddress.toLowerCase(),
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/address|recover|signer|did not match/i.test(msg)) {
      return { ok: false, reason: 'signature_address_mismatch' };
    }
    return { ok: false, reason: 'invalid_signature' };
  }
}
