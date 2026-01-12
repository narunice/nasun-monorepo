/**
 * Transaction Decoder
 *
 * Decodes raw transaction bytes into structured format.
 * Supports Move (Sui/Nasun) and EVM transaction formats.
 */

import type {
  DecodedTx,
  MoveDecodedTx,
  EVMDecodedTx,
  MoveCall,
  MoveArg,
  MoveArgType,
  EVMCall,
  EVMParam,
  TxCategory,
  TxChainType,
  ClearSigningConfig,
  ContractRegistry,
} from './types';
import { ClearSigningError, DEFAULT_CLEAR_SIGNING_CONFIG } from './types';

// ============================================
// Configuration
// ============================================

let globalConfig: ClearSigningConfig = { ...DEFAULT_CLEAR_SIGNING_CONFIG };

/**
 * Configure clear signing module
 */
export function configureClearSigning(config: Partial<ClearSigningConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current configuration
 */
export function getClearSigningConfig(): ClearSigningConfig {
  return { ...globalConfig };
}

// ============================================
// Main Decoder
// ============================================

/**
 * Decode transaction bytes
 *
 * @param txBytes - Raw transaction bytes
 * @param chainType - Chain type (move or evm)
 * @param chainId - Chain ID
 * @param sender - Sender address
 * @returns Decoded transaction
 */
export async function decodeTx(
  txBytes: Uint8Array,
  chainType: TxChainType,
  chainId: string,
  sender: string
): Promise<DecodedTx> {
  // Validate input
  if (!txBytes || txBytes.length === 0) {
    throw new ClearSigningError(
      'INVALID_TX_FORMAT',
      'Transaction bytes cannot be empty'
    );
  }

  const rawBytes = bytesToHex(txBytes);

  if (chainType === 'move') {
    return decodeMoveTransaction(txBytes, chainId, sender, rawBytes);
  } else if (chainType === 'evm') {
    return decodeEVMTransaction(txBytes, chainId, sender, rawBytes);
  }

  throw new ClearSigningError(
    'UNSUPPORTED_CHAIN',
    `Unsupported chain type: ${chainType}`
  );
}

// ============================================
// Move Transaction Decoder
// ============================================

/**
 * Decode Move transaction
 */
async function decodeMoveTransaction(
  txBytes: Uint8Array,
  chainId: string,
  sender: string,
  rawBytes: string
): Promise<MoveDecodedTx> {
  try {
    // Parse BCS-encoded transaction data
    const parsed = parseMoveTransactionBCS(txBytes);

    // Extract calls from parsed data
    const calls = parsed.commands.map(decodeMoveCommand);

    // Categorize transaction
    const category = categorizeMoveTransaction(calls);

    return {
      chainType: 'move',
      chainId,
      category,
      sender,
      rawBytes,
      calls,
      gasBudget: parsed.gasBudget,
      sponsor: parsed.sponsor,
      decodedAt: Date.now(),
    };
  } catch (error) {
    throw new ClearSigningError(
      'DECODE_FAILED',
      'Failed to decode Move transaction',
      error
    );
  }
}

/** Parsed Move transaction structure */
interface ParsedMoveTransaction {
  commands: MoveCommand[];
  gasBudget: bigint;
  sponsor?: string;
  inputs: MoveInput[];
}

/** Move command from PTB */
interface MoveCommand {
  type: 'moveCall' | 'transferObjects' | 'splitCoins' | 'mergeCoins' | 'publish' | 'upgrade';
  package?: string;
  module?: string;
  function?: string;
  typeArgs?: string[];
  args?: number[];
  objects?: number[];
  destination?: number;
  amounts?: number[];
}

/** Move input reference */
interface MoveInput {
  type: 'pure' | 'object' | 'receiving';
  value: Uint8Array | string;
  objectType?: string;
}

/**
 * Parse Move transaction BCS
 * Note: This is a simplified parser. Full implementation would use @mysten/bcs
 */
function parseMoveTransactionBCS(txBytes: Uint8Array): ParsedMoveTransaction {
  // Simplified BCS parsing
  // In production, use @mysten/sui/transactions for proper parsing
  const view = new DataView(txBytes.buffer, txBytes.byteOffset);

  // Basic structure detection
  // Transaction kind is at the beginning
  const commands: MoveCommand[] = [];
  const inputs: MoveInput[] = [];
  let gasBudget = 0n;
  let sponsor: string | undefined;

  // Try to detect transaction structure
  // This is a simplified heuristic - real implementation needs proper BCS decoder
  if (txBytes.length > 32) {
    // Check for PTB (Programmable Transaction Block) structure
    // First byte often indicates transaction kind
    const kind = txBytes[0];

    if (kind === 0 || kind === 1) {
      // Extract gas budget from typical location (last 8 bytes before signature)
      if (txBytes.length >= 8) {
        const gasBudgetOffset = Math.max(0, txBytes.length - 40);
        try {
          gasBudget = view.getBigUint64(gasBudgetOffset, true);
        } catch {
          gasBudget = 1_000_000n; // Default gas budget
        }
      }

      // Try to extract package/module/function from the bytes
      // This is a heuristic approach
      const decoded = extractMoveCallInfo(txBytes);
      if (decoded) {
        commands.push({
          type: 'moveCall',
          package: decoded.package,
          module: decoded.module,
          function: decoded.function,
          typeArgs: decoded.typeArgs,
          args: [],
        });
      }
    }
  }

  // If no commands extracted, create a generic one
  if (commands.length === 0) {
    commands.push({
      type: 'moveCall',
      package: 'unknown',
      module: 'unknown',
      function: 'unknown',
      typeArgs: [],
      args: [],
    });
  }

  return {
    commands,
    inputs,
    gasBudget: gasBudget || 10_000_000n,
    sponsor,
  };
}

/**
 * Extract Move call info from bytes
 */
function extractMoveCallInfo(txBytes: Uint8Array): {
  package: string;
  module: string;
  function: string;
  typeArgs: string[];
} | null {
  // Look for address patterns (32 bytes starting with 0x00 or 0x prefix hints)
  const text = bytesToUtf8(txBytes);

  // Try to find module::function pattern
  const modulePattern = /([a-zA-Z_][a-zA-Z0-9_]*)::([\w_]+)/;
  const match = text.match(modulePattern);

  if (match) {
    return {
      package: '0x2', // Default to framework
      module: match[1],
      function: match[2],
      typeArgs: [],
    };
  }

  return null;
}

/**
 * Decode Move command to MoveCall
 */
function decodeMoveCommand(cmd: MoveCommand): MoveCall {
  if (cmd.type === 'moveCall') {
    return {
      package: cmd.package || 'unknown',
      module: cmd.module || 'unknown',
      function: cmd.function || 'unknown',
      typeArgs: cmd.typeArgs || [],
      args: (cmd.args || []).map((_, i) => ({
        type: 'unknown' as MoveArgType,
        raw: `arg${i}`,
        decoded: `<arg${i}>`,
      })),
    };
  }

  // Handle other command types
  return {
    package: '0x2',
    module: 'sui',
    function: cmd.type,
    typeArgs: [],
    args: [],
  };
}

/**
 * Categorize Move transaction by calls
 */
function categorizeMoveTransaction(calls: MoveCall[]): TxCategory {
  if (calls.length === 0) return 'unknown';

  // Check first call for category hints
  const mainCall = calls[0];
  const funcLower = mainCall.function.toLowerCase();
  const moduleLower = mainCall.module.toLowerCase();

  // Transfer patterns
  if (
    funcLower.includes('transfer') ||
    funcLower === 'public_transfer' ||
    moduleLower === 'transfer'
  ) {
    return 'transfer';
  }

  // Swap patterns
  if (
    funcLower.includes('swap') ||
    moduleLower.includes('swap') ||
    moduleLower.includes('amm') ||
    moduleLower.includes('dex')
  ) {
    return 'swap';
  }

  // Staking patterns
  if (
    funcLower.includes('stake') ||
    funcLower.includes('unstake') ||
    funcLower.includes('delegate') ||
    moduleLower.includes('staking')
  ) {
    return 'stake';
  }

  // Governance patterns
  if (
    funcLower.includes('vote') ||
    funcLower.includes('propose') ||
    moduleLower.includes('governance')
  ) {
    return 'governance';
  }

  // NFT patterns
  if (
    funcLower.includes('mint') ||
    funcLower.includes('nft') ||
    moduleLower.includes('nft') ||
    moduleLower.includes('display')
  ) {
    return 'nft';
  }

  // DeFi patterns
  if (
    funcLower.includes('deposit') ||
    funcLower.includes('withdraw') ||
    funcLower.includes('borrow') ||
    funcLower.includes('repay') ||
    moduleLower.includes('lending') ||
    moduleLower.includes('pool')
  ) {
    return 'defi';
  }

  // System patterns
  if (
    funcLower.includes('upgrade') ||
    funcLower.includes('publish') ||
    moduleLower.includes('package')
  ) {
    return 'system';
  }

  return 'contract';
}

// ============================================
// EVM Transaction Decoder
// ============================================

/**
 * Decode EVM transaction
 */
async function decodeEVMTransaction(
  txBytes: Uint8Array,
  chainId: string,
  sender: string,
  rawBytes: string
): Promise<EVMDecodedTx> {
  try {
    // Parse RLP-encoded transaction
    const parsed = parseEVMTransactionRLP(txBytes);

    // Decode calldata if present
    let call: EVMCall | undefined;
    if (parsed.data && parsed.data.length > 4) {
      call = decodeEVMCalldata(parsed.data, parsed.to);
    }

    // Categorize transaction
    const category = categorizeEVMTransaction(call, parsed.to, parsed.value);

    return {
      chainType: 'evm',
      chainId,
      category,
      sender,
      rawBytes,
      to: parsed.to,
      value: parsed.value,
      call,
      gasLimit: parsed.gasLimit,
      maxFeePerGas: parsed.maxFeePerGas,
      maxPriorityFeePerGas: parsed.maxPriorityFeePerGas,
      nonce: parsed.nonce,
      decodedAt: Date.now(),
    };
  } catch (error) {
    throw new ClearSigningError(
      'DECODE_FAILED',
      'Failed to decode EVM transaction',
      error
    );
  }
}

/** Parsed EVM transaction */
interface ParsedEVMTransaction {
  to: string;
  value: bigint;
  data: Uint8Array;
  gasLimit: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

/**
 * Parse EVM transaction RLP
 * Note: Simplified parser. Production should use viem or ethers.js
 */
function parseEVMTransactionRLP(txBytes: Uint8Array): ParsedEVMTransaction {
  // EVM transaction types:
  // 0x01 = EIP-2930 (access list)
  // 0x02 = EIP-1559 (dynamic fee)
  // Legacy = no prefix

  const txType = txBytes[0];
  let offset = 0;

  if (txType === 0x02) {
    // EIP-1559 transaction
    offset = 1;
  } else if (txType === 0x01) {
    // EIP-2930 transaction
    offset = 1;
  }

  // Simplified RLP parsing
  // Real implementation needs proper RLP decoder
  const result: ParsedEVMTransaction = {
    to: '0x0000000000000000000000000000000000000000',
    value: 0n,
    data: new Uint8Array(0),
    gasLimit: 21000n,
    maxFeePerGas: undefined,
    maxPriorityFeePerGas: undefined,
  };

  // Try to extract 'to' address (20 bytes)
  if (txBytes.length >= offset + 21) {
    // Look for address-like patterns
    for (let i = offset; i < txBytes.length - 20; i++) {
      const potential = txBytes.slice(i, i + 20);
      if (isLikelyAddress(potential)) {
        result.to = '0x' + bytesToHex(potential);
        break;
      }
    }
  }

  // Try to extract value (look for bigint patterns)
  // This is a heuristic - real parsing needs RLP structure

  // Extract calldata (everything after basic fields)
  if (txBytes.length > 100) {
    // Assume calldata starts after standard fields
    const dataStart = Math.min(100, txBytes.length - 4);
    result.data = txBytes.slice(dataStart);
  }

  return result;
}

/**
 * Check if bytes look like an Ethereum address
 */
function isLikelyAddress(bytes: Uint8Array): boolean {
  if (bytes.length !== 20) return false;
  // Check if not all zeros
  return bytes.some((b) => b !== 0);
}

/**
 * Decode EVM calldata
 */
function decodeEVMCalldata(data: Uint8Array, to: string): EVMCall {
  // Extract 4-byte function selector
  const selector = bytesToHex(data.slice(0, 4));

  // Try to decode known selectors
  const known = KNOWN_SELECTORS[selector];

  const params: EVMParam[] = [];

  // Parse remaining bytes as 32-byte chunks (standard ABI encoding)
  const calldata = data.slice(4);
  for (let i = 0; i < calldata.length; i += 32) {
    const chunk = calldata.slice(i, i + 32);
    if (chunk.length === 32) {
      // Check if it looks like an address (first 12 bytes are zero)
      const isAddress = chunk
        .slice(0, 12)
        .every((b) => b === 0);
      const isZero = chunk.every((b) => b === 0);

      if (isAddress && !isZero) {
        params.push({
          name: `param${params.length}`,
          type: 'address',
          raw: bytesToHex(chunk),
          decoded: '0x' + bytesToHex(chunk.slice(12)),
        });
      } else {
        params.push({
          name: `param${params.length}`,
          type: 'uint256',
          raw: bytesToHex(chunk),
          decoded: bytesToBigInt(chunk),
        });
      }
    }
  }

  return {
    selector: '0x' + selector,
    signature: known?.signature,
    name: known?.name,
    params,
    contract: to,
    contractName: globalConfig.contractRegistry?.get('1', to)?.name,
  };
}

/** Known EVM function selectors */
const KNOWN_SELECTORS: Record<string, { name: string; signature: string }> = {
  // ERC-20
  'a9059cbb': { name: 'transfer', signature: 'transfer(address,uint256)' },
  '23b872dd': { name: 'transferFrom', signature: 'transferFrom(address,address,uint256)' },
  '095ea7b3': { name: 'approve', signature: 'approve(address,uint256)' },
  '70a08231': { name: 'balanceOf', signature: 'balanceOf(address)' },
  // ERC-721
  '42842e0e': { name: 'safeTransferFrom', signature: 'safeTransferFrom(address,address,uint256)' },
  'b88d4fde': { name: 'safeTransferFrom', signature: 'safeTransferFrom(address,address,uint256,bytes)' },
  'a22cb465': { name: 'setApprovalForAll', signature: 'setApprovalForAll(address,bool)' },
  // DEX
  '7ff36ab5': { name: 'swapExactETHForTokens', signature: 'swapExactETHForTokens(...)' },
  '38ed1739': { name: 'swapExactTokensForTokens', signature: 'swapExactTokensForTokens(...)' },
  '18cbafe5': { name: 'swapExactTokensForETH', signature: 'swapExactTokensForETH(...)' },
  // Permit
  'd505accf': { name: 'permit', signature: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)' },
};

/**
 * Categorize EVM transaction
 */
function categorizeEVMTransaction(
  call: EVMCall | undefined,
  to: string,
  value: bigint
): TxCategory {
  // Native transfer
  if (!call && value > 0n) {
    return 'transfer';
  }

  if (!call) return 'unknown';

  const funcName = call.name?.toLowerCase() || '';

  // Transfer patterns
  if (
    funcName === 'transfer' ||
    funcName === 'transferfrom' ||
    funcName === 'safetransferfrom'
  ) {
    return 'transfer';
  }

  // Swap patterns
  if (funcName.includes('swap')) {
    return 'swap';
  }

  // Approval patterns
  if (funcName === 'approve' || funcName === 'setapprovalforall') {
    return 'contract';
  }

  // Check contract registry for hints
  const contract = globalConfig.contractRegistry?.get('1', to);
  if (contract) {
    switch (contract.type) {
      case 'dex':
        return 'swap';
      case 'nft':
        return 'nft';
      case 'lending':
        return 'defi';
      case 'governance':
        return 'governance';
    }
  }

  return 'contract';
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to bigint
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Convert bytes to UTF-8 string (lossy)
 */
function bytesToUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

/**
 * Decode Move argument
 */
export function decodeMoveArg(
  arg: Uint8Array,
  typeHint?: MoveArgType
): MoveArg {
  const raw = bytesToHex(arg);
  const type = typeHint || inferMoveArgType(arg);

  let decoded: MoveArg['decoded'];

  switch (type) {
    case 'address':
      decoded = '0x' + raw;
      break;
    case 'u8':
      decoded = arg[0] || 0;
      break;
    case 'u16':
      decoded = new DataView(arg.buffer, arg.byteOffset).getUint16(0, true);
      break;
    case 'u32':
      decoded = new DataView(arg.buffer, arg.byteOffset).getUint32(0, true);
      break;
    case 'u64':
      decoded = new DataView(arg.buffer, arg.byteOffset).getBigUint64(0, true);
      break;
    case 'u128':
    case 'u256':
      decoded = bytesToBigInt(arg);
      break;
    case 'bool':
      decoded = arg[0] !== 0;
      break;
    case 'string':
      decoded = bytesToUtf8(arg);
      break;
    default:
      decoded = raw;
  }

  return { type, raw, decoded };
}

/**
 * Infer Move argument type from bytes
 */
function inferMoveArgType(arg: Uint8Array): MoveArgType {
  // 32 bytes = likely address or u256
  if (arg.length === 32) {
    // Check if first 12 bytes are zero (address pattern)
    if (arg.slice(0, 12).every((b) => b === 0)) {
      return 'address';
    }
    return 'u256';
  }

  // 1 byte = bool or u8
  if (arg.length === 1) {
    return arg[0] <= 1 ? 'bool' : 'u8';
  }

  // 8 bytes = u64
  if (arg.length === 8) {
    return 'u64';
  }

  // 16 bytes = u128
  if (arg.length === 16) {
    return 'u128';
  }

  return 'unknown';
}

/**
 * Decode address from bytes
 */
export function decodeAddress(bytes: Uint8Array): string {
  if (bytes.length === 32) {
    // Sui/Move address (32 bytes)
    return '0x' + bytesToHex(bytes);
  } else if (bytes.length === 20) {
    // EVM address (20 bytes)
    return '0x' + bytesToHex(bytes);
  }
  throw new Error(`Invalid address length: ${bytes.length}`);
}

/**
 * Check if address is valid
 */
export function isValidAddress(address: string, chainType: TxChainType): boolean {
  const cleaned = address.toLowerCase().replace('0x', '');

  if (chainType === 'move') {
    // Sui/Move addresses are 64 hex characters (32 bytes)
    return /^[0-9a-f]{64}$/.test(cleaned);
  } else {
    // EVM addresses are 40 hex characters (20 bytes)
    return /^[0-9a-f]{40}$/.test(cleaned);
  }
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars = 6): string {
  const clean = address.toLowerCase();
  // Don't shorten if already short enough
  // Shortened format: 0x + {chars} + ... + {chars}
  // Minimum length worth shortening = prefix(2) + chars + ellipsis(3) + chars
  const minLengthToShorten = 2 + chars + 3 + chars + 1;
  if (clean.length <= minLengthToShorten) return clean;
  return `${clean.slice(0, chars + 2)}...${clean.slice(-chars)}`;
}
