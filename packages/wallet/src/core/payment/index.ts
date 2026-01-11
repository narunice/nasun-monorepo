/**
 * Payment UX Module
 *
 * Intent-based payment system for Move and EVM chains.
 * Compatible with WalletConnect Pay and Pado PaymentQRCode.
 */

// Types
export type {
  PaymentChainType,
  PaymentIntentStatus,
  PaymentStatus,
  PaymentMetadata,
  PaymentIntent,
  MovePaymentRequest,
  EVMPaymentRequest,
  PaymentRequest,
  PaymentResult,
  PaymentLink,
  ParsedPaymentLink,
  PaymentValidationError,
  PaymentValidationWarning,
  RecipientStatus,
  PaymentValidation,
} from './types';

export {
  DEFAULT_INTENT_TTL_MS,
  NASUN_COIN_TYPE,
  DEFAULT_TOKEN_SYMBOL,
  URL_PARAMS,
} from './types';

// Validation
export {
  isValidMoveChainAddress,
  isValidEVMAddress,
  isValidPaymentAddress,
  validateAmount,
  checkSufficientBalance,
  detectWarnings,
  validateMovePayment,
  validateEVMPayment,
  validatePayment,
  formatValidationErrors,
  formatValidationWarnings,
} from './validation';

// Link utilities
export {
  buildPaymentUrl,
  generatePaymentLink,
  parsePaymentLink,
  parseCurrentUrl,
  intentToUrlParams,
  intentToRequest,
  parsedLinkToIntent,
  generateIntentId,
  encodePaymentData,
  decodePaymentData,
  formatPaymentLinkForSharing,
} from './link';

// QR code utilities
export type { QRCodeOptions, QRCodeResult } from './qr';

export {
  generateQRCodeDataUrl,
  generateQRCodeSVG,
  generateQRCode,
  generatePaymentQRCode,
  isValidQRCodeContent,
  estimateQRVersion,
  getRecommendedQRSize,
} from './qr';
