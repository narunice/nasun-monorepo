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
import { verifyMessage as ethersVerifyMessage, getAddress, isAddress } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export interface AdditionalChain {
  provider: 'sui' | 'solana' | 'metamask';
  noncePrefix: string;
  // address-owner `chain` query param (the box route supports sui|solana|metamask).
  ownerChainParam: 'sui' | 'solana' | 'metamask';
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

// Challenge message: byte-identical to auth-sui/src/handlers/challenge.ts AND
// auth-solana-additional/src/handlers/challenge.ts (both use this exact string -- verified by od).
// The signed bytes MUST match what the wallet signs, so this string is part of the security contract.
function buildLinkWalletMessage(walletAddress: string, nonce: string, purpose: string): string {
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
  buildMessage: buildLinkWalletMessage,
};

// --- Solana (C4-1b) -------------------------------------------------------------------------------
// A Solana address IS a 32-byte Ed25519 public key encoded as base58 (case-SENSITIVE, no checksum).
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Mirror of auth-solana-additional/src/utils/solana.ts:toSolAddress (bs58 decode + 32-byte length;
// case preserved -- base58 is case-sensitive, no lowercasing unlike sui/evm).
function solToAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!SOL_ADDRESS_RE.test(raw)) return null;
  try {
    return bs58.decode(raw).length === 32 ? raw : null;
  } catch {
    return null;
  }
}

// Case-sensitive equality (auth-solana-additional/src/utils/solana.ts:addrEq).
function exactAddrEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b;
}

// Mirror of auth-solana-additional/src/utils/solana.ts:verifySolSignature (tweetnacl 1.0.3, byte-parity
// with the lambda's vendored tweetnacl). For Solana the address IS the Ed25519 public key, so we verify
// the signature against the CHALLENGED address (expectedAddress) directly -- the client-supplied
// publicKey echo is never trusted (the lambda asserts publicKey===challenged address; here the challenged
// address is authoritative). Returns the canonical address on success, null on any failure.
async function solanaVerify(message: string, signature: string, expectedAddress: string): Promise<string | null> {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const pubBytes = bs58.decode(expectedAddress);
    if (sigBytes.length !== 64 || pubBytes.length !== 32) return null;
    return nacl.sign.detached.verify(messageBytes, sigBytes, pubBytes) ? expectedAddress : null;
  } catch (err) {
    console.error('[compute] solana signature verify failed:', (err as Error)?.message);
    return null;
  }
}

export const SOLANA_CHAIN: AdditionalChain = {
  provider: 'solana',
  noncePrefix: 'solana_additional:',
  ownerChainParam: 'solana',
  allowsPrimaryCreation: true, // first verify becomes the primary (same as sui)
  includesPrimaryInResponse: true,
  toAddress: solToAddress,
  addrEq: exactAddrEq,
  verify: solanaVerify,
  buildMessage: buildLinkWalletMessage,
};

// --- MetaMask / EVM (C4-1c) -----------------------------------------------------------------------
// Mirror of auth-metamask-additional/src/utils/ethereum.ts. An EVM address is a 20-byte hex string
// stored CHECKSUM-cased (getAddress) and compared case-insensitively. ethers is already bundled (C3a
// metamask login uses verifyMessage). UNLIKE sui/solana, metamask is APPEND-ONLY: the primary metamask
// link must pre-exist (allowsPrimaryCreation=false -> the chain-generic appendVerified throws
// 'primary metamask required'), and the verify response omits `primary` (includesPrimaryInResponse=false).

// Mirror of ethereum.ts:toChecksum (isAddress gate + getAddress checksum-normalize).
function evmToAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!isAddress(raw)) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

// Mirror of ethereum.ts:verifySignature + verify.ts addrEq check. Recover the EIP-191 signer via ethers
// verifyMessage and assert it equals the CHALLENGED address (case-insensitive). Returns the canonical
// (checksummed) challenged address on success, null on mismatch/malformed signature.
async function evmVerify(message: string, signature: string, expectedAddress: string): Promise<string | null> {
  try {
    const recovered = ethersVerifyMessage(message, signature);
    return lowerAddrEq(recovered, expectedAddress) ? expectedAddress : null;
  } catch (err) {
    console.error('[compute] evm signature verify failed:', (err as Error)?.message);
    return null;
  }
}

export const METAMASK_CHAIN: AdditionalChain = {
  provider: 'metamask',
  noncePrefix: 'additional:',
  ownerChainParam: 'metamask',
  allowsPrimaryCreation: false, // append-only: a verified primary metamask link must already exist
  includesPrimaryInResponse: false,
  toAddress: evmToAddress,
  addrEq: lowerAddrEq,
  verify: evmVerify,
  buildMessage: buildLinkWalletMessage,
};

// Registry keyed by the chain-prefixed route segment the API Gateway repoint encodes
// (/compute/<segment>-additional/...).
export const CHAINS: Record<string, AdditionalChain> = {
  sui: SUI_CHAIN,
  solana: SOLANA_CHAIN,
  metamask: METAMASK_CHAIN,
};
