/**
 * Payment Link Module
 *
 * Generate and parse payment links compatible with Pado PaymentQRCode.
 * URL format: ?to=address&amount=X&token=SYMBOL&msg=MESSAGE
 */

import {
  URL_PARAMS,
  DEFAULT_TOKEN_SYMBOL,
  type PaymentLink,
  type ParsedPaymentLink,
  type PaymentIntent,
  type PaymentRequest,
  type MovePaymentRequest,
  type EVMPaymentRequest,
} from './types';
import { isValidMoveChainAddress, isValidEVMAddress } from './validation';

// ============================================
// Payment Link Generation
// ============================================

/**
 * Build payment URL with query parameters
 * Compatible with Pado PaymentQRCode component
 *
 * @param baseUrl Base URL (e.g., 'https://pado.nasun.io/send')
 * @param params Payment parameters
 * @returns Full payment URL
 */
export function buildPaymentUrl(
  baseUrl: string,
  params: {
    recipient: string;
    amount?: string;
    token?: string;
    message?: string;
    chain?: string;
    referenceId?: string;
  }
): string {
  const url = new URL(baseUrl);

  url.searchParams.set(URL_PARAMS.TO, params.recipient);

  if (params.amount) {
    url.searchParams.set(URL_PARAMS.AMOUNT, params.amount);
  }

  if (params.token && params.token !== DEFAULT_TOKEN_SYMBOL) {
    url.searchParams.set(URL_PARAMS.TOKEN, params.token);
  }

  if (params.message) {
    url.searchParams.set(URL_PARAMS.MESSAGE, params.message);
  }

  if (params.chain) {
    url.searchParams.set(URL_PARAMS.CHAIN, params.chain);
  }

  if (params.referenceId) {
    url.searchParams.set(URL_PARAMS.REF, params.referenceId);
  }

  return url.toString();
}

/**
 * Generate a payment link
 *
 * @param recipient Recipient address
 * @param options Optional parameters
 * @returns Payment link object
 */
export function generatePaymentLink(
  recipient: string,
  options?: {
    amount?: string;
    token?: string;
    message?: string;
    baseUrl?: string;
  }
): PaymentLink {
  const baseUrl = options?.baseUrl || `${getDefaultBaseUrl()}/send`;
  const token = options?.token || DEFAULT_TOKEN_SYMBOL;

  const url = buildPaymentUrl(baseUrl, {
    recipient,
    amount: options?.amount,
    token,
    message: options?.message,
  });

  return {
    url,
    baseUrl,
    recipient,
    amount: options?.amount,
    token,
    message: options?.message,
  };
}

/**
 * Get default base URL from window.location if available
 */
function getDefaultBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'https://pado.nasun.io';
}

// ============================================
// Payment Link Parsing
// ============================================

/**
 * Parse payment URL parameters
 *
 * @param url URL string or URL object
 * @returns Parsed payment link data
 */
export function parsePaymentLink(url: string | URL): ParsedPaymentLink {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    const params = urlObj.searchParams;

    const recipient = params.get(URL_PARAMS.TO);

    if (!recipient) {
      return {
        recipient: '',
        token: DEFAULT_TOKEN_SYMBOL,
        valid: false,
        error: 'Missing recipient address',
      };
    }

    // Validate address format
    const isMove = isValidMoveChainAddress(recipient);
    const isEVM = isValidEVMAddress(recipient);

    if (!isMove && !isEVM) {
      return {
        recipient,
        token: DEFAULT_TOKEN_SYMBOL,
        valid: false,
        error: 'Invalid recipient address format',
      };
    }

    const amount = params.get(URL_PARAMS.AMOUNT) || undefined;
    const token = params.get(URL_PARAMS.TOKEN) || DEFAULT_TOKEN_SYMBOL;
    const message = params.get(URL_PARAMS.MESSAGE) || undefined;
    const chainId = params.get(URL_PARAMS.CHAIN) || undefined;

    // Validate amount if provided
    if (amount) {
      const value = parseFloat(amount);
      if (isNaN(value) || value <= 0) {
        return {
          recipient,
          token,
          valid: false,
          error: 'Invalid amount',
        };
      }
    }

    return {
      recipient,
      amount,
      token,
      chainId,
      message,
      valid: true,
    };
  } catch (error) {
    return {
      recipient: '',
      token: DEFAULT_TOKEN_SYMBOL,
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid URL',
    };
  }
}

/**
 * Extract payment link from current URL (for /send pages)
 *
 * @returns Parsed payment link or null if not a payment URL
 */
export function parseCurrentUrl(): ParsedPaymentLink | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  // Check if URL has payment parameters
  const url = new URL(window.location.href);
  if (!url.searchParams.has(URL_PARAMS.TO)) {
    return null;
  }

  return parsePaymentLink(url);
}

// ============================================
// Intent <-> Link Conversion
// ============================================

/**
 * Convert payment intent to URL parameters
 *
 * @param intent Payment intent
 * @returns URLSearchParams object
 */
export function intentToUrlParams(intent: PaymentIntent): URLSearchParams {
  const params = new URLSearchParams();

  params.set(URL_PARAMS.TO, intent.recipient);

  if (intent.amount && intent.amount !== '0') {
    params.set(URL_PARAMS.AMOUNT, intent.amount);
  }

  if (intent.token !== DEFAULT_TOKEN_SYMBOL) {
    params.set(URL_PARAMS.TOKEN, intent.token);
  }

  if (intent.message) {
    params.set(URL_PARAMS.MESSAGE, intent.message);
  }

  if (intent.chainId) {
    params.set(URL_PARAMS.CHAIN, intent.chainId);
  }

  if (intent.referenceId) {
    params.set(URL_PARAMS.REF, intent.referenceId);
  }

  return params;
}

/**
 * Convert payment intent to payment request
 *
 * @param intent Payment intent
 * @returns Payment request ready for execution
 */
export function intentToRequest(intent: PaymentIntent): PaymentRequest {
  if (intent.chainType === 'move') {
    const request: MovePaymentRequest = {
      chainType: 'move',
      recipient: intent.recipient,
      amount: intent.amount,
      tokenType: intent.tokenType || '0x2::sui::SUI',
      message: intent.message,
    };
    return request;
  }

  const request: EVMPaymentRequest = {
    chainType: 'evm',
    chainId: parseInt(intent.chainId, 10),
    recipient: intent.recipient,
    amount: intent.amount,
    tokenAddress: intent.tokenType,
    message: intent.message,
  };
  return request;
}

/**
 * Create payment intent from parsed link
 *
 * @param parsed Parsed payment link
 * @param chainType Chain type to use
 * @returns Payment intent or null if invalid
 */
export function parsedLinkToIntent(
  parsed: ParsedPaymentLink,
  chainType: 'move' | 'evm' = 'move'
): PaymentIntent | null {
  if (!parsed.valid) {
    return null;
  }

  const id = generateIntentId();
  const now = Date.now();

  return {
    id,
    version: 1,
    chainType,
    chainId: parsed.chainId || (chainType === 'move' ? 'nasun-devnet' : '1'),
    recipient: parsed.recipient,
    amount: parsed.amount || '0',
    token: parsed.token,
    message: parsed.message,
    createdAt: now,
    status: 'pending',
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a unique intent ID (UUID v4 format)
 */
export function generateIntentId(): string {
  // Use crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback to manual UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Encode payment data for URL-safe transmission
 *
 * @param data Payment data object
 * @returns Base64url encoded string
 */
export function encodePaymentData(data: Record<string, unknown>): string {
  const json = JSON.stringify(data);
  const base64 = btoa(json);
  // Convert to URL-safe base64
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode payment data from URL-safe string
 *
 * @param encoded Base64url encoded string
 * @returns Decoded payment data object
 */
export function decodePaymentData(encoded: string): Record<string, unknown> | null {
  try {
    // Convert from URL-safe base64
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Create a shareable payment link for the clipboard
 *
 * @param link Payment link object
 * @returns Formatted text for sharing
 */
export function formatPaymentLinkForSharing(link: PaymentLink): string {
  let text = `Send ${link.token} payment to ${link.recipient}`;

  if (link.amount) {
    text = `Send ${link.amount} ${link.token} to ${link.recipient}`;
  }

  if (link.message) {
    text += `\nNote: ${link.message}`;
  }

  text += `\n\n${link.url}`;

  return text;
}
