/**
 * Payment Validation Module
 *
 * Validation logic for payment requests including address validation,
 * balance checks, and security warnings.
 */

import { isValidAddress as isValidMoveAddress } from '../../sui/client';
import { isAddress as isValidEVMAddressViem, getAddress } from 'viem';
import type {
  PaymentRequest,
  MovePaymentRequest,
  EVMPaymentRequest,
  PaymentValidation,
  PaymentValidationError,
  PaymentValidationWarning,
  RecipientStatus,
} from './types';

// ============================================
// Address Validation
// ============================================

/**
 * Validate Move chain address (Sui format)
 * @param address Address to validate
 * @returns Whether address is valid
 */
export function isValidMoveChainAddress(address: string): boolean {
  return isValidMoveAddress(address);
}

/**
 * Validate EVM address with checksum
 * @param address Address to validate
 * @returns Whether address is valid
 */
export function isValidEVMAddress(address: string): boolean {
  try {
    if (!isValidEVMAddressViem(address)) {
      return false;
    }
    // Verify checksum by converting to checksummed address
    getAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate address based on chain type
 * @param address Address to validate
 * @param chainType Chain type ('move' or 'evm')
 * @returns Whether address is valid
 */
export function isValidPaymentAddress(
  address: string,
  chainType: 'move' | 'evm'
): boolean {
  if (chainType === 'move') {
    return isValidMoveChainAddress(address);
  }
  return isValidEVMAddress(address);
}

// ============================================
// Amount Validation
// ============================================

/**
 * Validate payment amount
 * @param amount Amount string in display units
 * @returns Validation result with error reason if invalid
 */
export function validateAmount(amount: string): { valid: boolean; reason?: string } {
  if (!amount || amount.trim() === '') {
    return { valid: false, reason: 'Amount is required' };
  }

  // Check for valid number format
  const numericPattern = /^[0-9]+\.?[0-9]*$/;
  if (!numericPattern.test(amount)) {
    return { valid: false, reason: 'Invalid amount format' };
  }

  // Parse amount
  const value = parseFloat(amount);
  if (isNaN(value) || !isFinite(value)) {
    return { valid: false, reason: 'Invalid amount value' };
  }

  if (value <= 0) {
    return { valid: false, reason: 'Amount must be greater than 0' };
  }

  // Check for reasonable precision (max 9 decimals for Move, 18 for EVM)
  const parts = amount.split('.');
  if (parts[1] && parts[1].length > 18) {
    return { valid: false, reason: 'Too many decimal places' };
  }

  return { valid: true };
}

// ============================================
// Balance Validation
// ============================================

/**
 * Check if balance is sufficient for payment
 * @param amount Payment amount in display units
 * @param balance Available balance in display units
 * @param gasEstimate Estimated gas cost in display units
 * @returns Validation result
 */
export function checkSufficientBalance(
  amount: string,
  balance: string,
  gasEstimate?: string
): { sufficient: boolean; required: string; available: string } {
  const amountValue = parseFloat(amount);
  const balanceValue = parseFloat(balance);
  const gasValue = gasEstimate ? parseFloat(gasEstimate) : 0;

  const required = amountValue + gasValue;
  const sufficient = balanceValue >= required;

  return {
    sufficient,
    required: required.toString(),
    available: balance,
  };
}

// ============================================
// Warning Detection
// ============================================

/** Large amount threshold (in display units) */
const LARGE_AMOUNT_THRESHOLD = 1000;

/**
 * Detect potential warnings for a payment
 * @param request Payment request
 * @param recipientStatus Recipient status from address book
 * @param gasBalance Available gas balance
 * @param gasEstimate Estimated gas cost
 * @returns Array of warnings
 */
export function detectWarnings(
  request: PaymentRequest,
  recipientStatus?: RecipientStatus,
  gasBalance?: string,
  gasEstimate?: string
): PaymentValidationWarning[] {
  const warnings: PaymentValidationWarning[] = [];

  // New recipient warning
  if (recipientStatus && !recipientStatus.isKnown) {
    warnings.push({
      type: 'NEW_RECIPIENT',
      address: request.recipient,
    });
  }

  // Large amount warning
  const amount = parseFloat(request.amount);
  if (amount >= LARGE_AMOUNT_THRESHOLD) {
    warnings.push({
      type: 'LARGE_AMOUNT',
      amount: request.amount,
      threshold: LARGE_AMOUNT_THRESHOLD.toString(),
    });
  }

  // Low gas balance warning
  if (gasBalance && gasEstimate) {
    const gasBalanceValue = parseFloat(gasBalance);
    const gasEstimateValue = parseFloat(gasEstimate);
    // Warn if gas balance is less than 1.5x estimated gas
    if (gasBalanceValue < gasEstimateValue * 1.5) {
      warnings.push({
        type: 'LOW_GAS_BALANCE',
        gasBalance,
        estimated: gasEstimate,
      });
    }
  }

  return warnings;
}

// ============================================
// Full Payment Validation
// ============================================

/**
 * Validate a Move chain payment request
 * @param request Move payment request
 * @param options Validation options
 * @returns Validation result
 */
export function validateMovePayment(
  request: MovePaymentRequest,
  options?: {
    balance?: string;
    gasBalance?: string;
    gasEstimate?: string;
    recipientStatus?: RecipientStatus;
    isConnected?: boolean;
    hasSigner?: boolean;
  }
): PaymentValidation {
  const errors: PaymentValidationError[] = [];
  const warnings: PaymentValidationWarning[] = [];

  // Check wallet connection
  if (options?.isConnected === false) {
    errors.push({ type: 'WALLET_NOT_CONNECTED' });
  }

  // Check signer availability
  if (options?.hasSigner === false) {
    errors.push({ type: 'SIGNER_NOT_AVAILABLE' });
  }

  // Validate address
  if (!isValidMoveChainAddress(request.recipient)) {
    errors.push({ type: 'INVALID_ADDRESS', address: request.recipient });
  }

  // Validate amount
  const amountValidation = validateAmount(request.amount);
  if (!amountValidation.valid) {
    errors.push({ type: 'INVALID_AMOUNT', reason: amountValidation.reason! });
  }

  // Check balance if provided
  if (options?.balance !== undefined && amountValidation.valid) {
    const balanceCheck = checkSufficientBalance(
      request.amount,
      options.balance,
      options.gasEstimate
    );
    if (!balanceCheck.sufficient) {
      errors.push({
        type: 'INSUFFICIENT_BALANCE',
        required: balanceCheck.required,
        available: balanceCheck.available,
      });
    }
  }

  // Detect warnings
  warnings.push(
    ...detectWarnings(
      request,
      options?.recipientStatus,
      options?.gasBalance,
      options?.gasEstimate
    )
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedGas: options?.gasEstimate,
    recipientStatus: options?.recipientStatus,
  };
}

/**
 * Validate an EVM chain payment request
 * @param request EVM payment request
 * @param options Validation options
 * @returns Validation result
 */
export function validateEVMPayment(
  request: EVMPaymentRequest,
  options?: {
    balance?: string;
    gasBalance?: string;
    gasEstimate?: string;
    recipientStatus?: RecipientStatus;
    isConnected?: boolean;
    hasSigner?: boolean;
    currentChainId?: number;
  }
): PaymentValidation {
  const errors: PaymentValidationError[] = [];
  const warnings: PaymentValidationWarning[] = [];

  // Check wallet connection
  if (options?.isConnected === false) {
    errors.push({ type: 'WALLET_NOT_CONNECTED' });
  }

  // Check signer availability
  if (options?.hasSigner === false) {
    errors.push({ type: 'SIGNER_NOT_AVAILABLE' });
  }

  // Check chain ID match
  if (options?.currentChainId !== undefined && options.currentChainId !== request.chainId) {
    errors.push({
      type: 'CHAIN_MISMATCH',
      expected: request.chainId.toString(),
      current: options.currentChainId.toString(),
    });
  }

  // Validate address
  if (!isValidEVMAddress(request.recipient)) {
    errors.push({ type: 'INVALID_ADDRESS', address: request.recipient });
  }

  // Validate amount
  const amountValidation = validateAmount(request.amount);
  if (!amountValidation.valid) {
    errors.push({ type: 'INVALID_AMOUNT', reason: amountValidation.reason! });
  }

  // Check balance if provided
  if (options?.balance !== undefined && amountValidation.valid) {
    const balanceCheck = checkSufficientBalance(
      request.amount,
      options.balance,
      request.useSmartAccount ? undefined : options.gasEstimate // No gas for sponsored
    );
    if (!balanceCheck.sufficient) {
      errors.push({
        type: 'INSUFFICIENT_BALANCE',
        required: balanceCheck.required,
        available: balanceCheck.available,
      });
    }
  }

  // Detect warnings
  warnings.push(
    ...detectWarnings(
      request,
      options?.recipientStatus,
      options?.gasBalance,
      options?.gasEstimate
    )
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedGas: options?.gasEstimate,
    recipientStatus: options?.recipientStatus,
  };
}

/**
 * Validate a payment request (auto-detect chain type)
 * @param request Payment request
 * @param options Validation options
 * @returns Validation result
 */
export function validatePayment(
  request: PaymentRequest,
  options?: {
    balance?: string;
    gasBalance?: string;
    gasEstimate?: string;
    recipientStatus?: RecipientStatus;
    isConnected?: boolean;
    hasSigner?: boolean;
    currentChainId?: number;
  }
): PaymentValidation {
  if (request.chainType === 'move') {
    return validateMovePayment(request, options);
  }
  return validateEVMPayment(request, options);
}

/**
 * Format validation errors into human-readable messages
 * @param errors Validation errors
 * @returns Array of error messages
 */
export function formatValidationErrors(errors: PaymentValidationError[]): string[] {
  return errors.map((error) => {
    switch (error.type) {
      case 'INSUFFICIENT_BALANCE':
        return `Insufficient balance. Required: ${error.required}, Available: ${error.available}`;
      case 'INVALID_ADDRESS':
        return `Invalid recipient address: ${error.address}`;
      case 'INVALID_AMOUNT':
        return `Invalid amount: ${error.reason}`;
      case 'UNSUPPORTED_TOKEN':
        return `Unsupported token: ${error.token}`;
      case 'CHAIN_MISMATCH':
        return `Wrong chain. Expected: ${error.expected}, Current: ${error.current}`;
      case 'WALLET_NOT_CONNECTED':
        return 'Wallet not connected';
      case 'SIGNER_NOT_AVAILABLE':
        return 'Signer not available';
      default:
        return 'Unknown validation error';
    }
  });
}

/**
 * Format validation warnings into human-readable messages
 * @param warnings Validation warnings
 * @returns Array of warning messages
 */
export function formatValidationWarnings(warnings: PaymentValidationWarning[]): string[] {
  return warnings.map((warning) => {
    switch (warning.type) {
      case 'NEW_RECIPIENT':
        return `Sending to new address: ${warning.address}`;
      case 'LARGE_AMOUNT':
        return `Large payment: ${warning.amount} (threshold: ${warning.threshold})`;
      case 'LOW_GAS_BALANCE':
        return `Low gas balance: ${warning.gasBalance} (estimated: ${warning.estimated})`;
      case 'CONTRACT_RECIPIENT':
        return `Recipient is a contract: ${warning.address}`;
      default:
        return 'Unknown warning';
    }
  });
}
