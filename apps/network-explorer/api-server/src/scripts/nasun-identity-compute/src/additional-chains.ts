// Per-chain config for the C4-1 additional-wallet lift. Each chain differs only in: the linked_accounts
// provider key, address validation/normalization, address equality (sui/metamask case-insensitive;
// solana case-sensitive base58), signature recovery, whether the first verify may CREATE the primary
// (sui/solana yes; metamask append-only), whether the verify response carries `primary`, the nonce
// prefix, and the box address-owner `chain` param (sui|solana box-served; metamask needs a box branch
// = deferred to C4-1c). The shared link logic + handlers are parameterized by this config so the three
// chains reuse one implementation.
//
// C4-1a ships SUI only. solana + metamask append their configs here later (solana = tweetnacl/bs58
// Ed25519, separate dep decision; metamask = ethers, append-only, needs the box address-owner branch).

import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

export interface AdditionalChain {
  provider: 'sui' | 'solana' | 'metamask';
  noncePrefix: string;
  // address-owner `chain` query param (the box route supports sui|solana today).
  ownerChainParam: 'sui' | 'solana';
  // First verify CREATES the primary link (sui/solana); metamask requires a pre-existing primary.
  allowsPrimaryCreation: boolean;
  // verify response includes a `primary` boolean (sui/solana) vs omits it (metamask).
  includesPrimaryInResponse: boolean;
  // Validate + canonicalize a raw address. Returns the canonical form or null.
  toAddress(raw: unknown): string | null;
  // Equality after canonicalization (sui/metamask lowercase; solana exact base58).
  addrEq(a: string | null | undefined, b: string | null | undefined): boolean;
  // Recover the signer and assert it matches expectedAddress. Returns the canonical recovered address
  // or null on any mismatch/failure. message MUST be the stored challenge message (never client input).
  verify(message: string, signature: string, expectedAddress: string): Promise<string | null>;
  // Challenge message builder (chain-specific wording). purpose = appId or 'generic'.
  buildMessage(walletAddress: string, nonce: string, purpose: string): string;
}

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

function suiToAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!SUI_ADDRESS_RE.test(raw)) return null;
  return raw.toLowerCase();
}

function lowerAddrEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

// Mirror of auth-sui/src/utils/sui.ts:verifySuiPersonalSignature (verbatim recovery semantics:
// verifyPersonalMessageSignature handles the BCS intent prefix; recovered Sui address must equal the
// challenged address). SECURITY-CRITICAL: a test-vector parity gate (box == lambda) is mandatory.
async function suiVerify(message: string, signature: string, expectedAddress: string): Promise<string | null> {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
    const recovered = publicKey.toSuiAddress().toLowerCase();
    if (recovered !== expectedAddress.toLowerCase()) return null;
    return recovered;
  } catch (err) {
    console.error('[compute] sui signature verify failed:', (err as Error)?.message);
    return null;
  }
}

// Challenge message: byte-identical to auth-sui/src/handlers/challenge.ts (the signed bytes MUST match
// what the wallet signs, so this string is part of the security contract).
function suiBuildMessage(walletAddress: string, nonce: string, purpose: string): string {
  return (
    `Nasun — link wallet (read-only).\n\n` +
    `By signing, you prove ownership of:\n` +
    `${walletAddress}\n\n` +
    `Nasun will never request a transaction signature from this wallet. This is a one-time link only.\n\n` +
    `Purpose: ${purpose}\n` +
    `Nonce: ${nonce}`
  );
}

export const SUI_CHAIN: AdditionalChain = {
  provider: 'sui',
  noncePrefix: 'sui_additional:',
  ownerChainParam: 'sui',
  allowsPrimaryCreation: true,
  includesPrimaryInResponse: true,
  toAddress: suiToAddress,
  addrEq: lowerAddrEq,
  verify: suiVerify,
  buildMessage: suiBuildMessage,
};

// Registry keyed by the chain-prefixed route segment the API Gateway repoint encodes
// (/compute/<segment>-additional/...). Solana + metamask append here in C4-1b/c.
export const CHAINS: Record<string, AdditionalChain> = {
  sui: SUI_CHAIN,
};
