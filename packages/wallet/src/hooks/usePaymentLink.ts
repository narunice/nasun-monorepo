/**
 * usePaymentLink Hook
 *
 * Generate and parse payment links with QR codes.
 * Synergy with Pado PaymentQRCode component.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSigner } from './useSigner';
import {
  generatePaymentLink,
  parsePaymentLink,
  generatePaymentQRCode,
  formatPaymentLinkForSharing,
  DEFAULT_TOKEN_SYMBOL,
} from '../core/payment';
import type { PaymentLink, ParsedPaymentLink } from '../core/payment/types';

// ============================================
// Types
// ============================================

/**
 * Options for usePaymentLink hook
 */
export interface UsePaymentLinkOptions {
  /** Default token for links */
  defaultToken?: string;
  /** Default base URL */
  defaultBaseUrl?: string;
  /** QR code size (pixels) */
  qrSize?: number;
}

/**
 * Result of usePaymentLink hook
 */
export interface UsePaymentLinkResult {
  /** Generate a payment link */
  generateLink: (params: {
    amount?: string;
    token?: string;
    message?: string;
  }) => Promise<PaymentLink>;
  /** Parse a payment link URL */
  parseLink: (url: string) => ParsedPaymentLink;
  /** Current recipient address (from wallet) */
  recipientAddress: string | null;
  /** Generate QR code data URL for a payment link */
  generateQRCode: (link: PaymentLink) => Promise<string>;
  /** Loading state for QR generation */
  isGenerating: boolean;
  /** Copy link to clipboard */
  copyToClipboard: (link: PaymentLink) => Promise<boolean>;
  /** Error message */
  error: string | null;
  /** Clear error */
  clearError: () => void;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for generating and parsing payment links
 *
 * @param options Hook options
 *
 * @example
 * ```tsx
 * const { generateLink, parseLink, recipientAddress } = usePaymentLink();
 *
 * // Generate a link for receiving payments
 * const link = await generateLink({ amount: '100', token: 'NSN' });
 * console.log(link.url);      // https://pado.nasun.io/send?to=0x...&amount=100
 * console.log(link.qrCodeDataUrl); // data:image/png;base64,...
 *
 * // Parse incoming payment link
 * const parsed = parseLink('https://pado.nasun.io/send?to=0x...&amount=50');
 * if (parsed.valid) {
 *   console.log(parsed.recipient, parsed.amount);
 * }
 * ```
 */
export function usePaymentLink(options?: UsePaymentLinkOptions): UsePaymentLinkResult {
  const { address } = useSigner();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultToken = options?.defaultToken || DEFAULT_TOKEN_SYMBOL;
  const defaultBaseUrl = options?.defaultBaseUrl;
  const qrSize = options?.qrSize || 256;

  /**
   * Generate a payment link for receiving payments
   */
  const generateLink = useCallback(
    async (params: {
      amount?: string;
      token?: string;
      message?: string;
    }): Promise<PaymentLink> => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      setError(null);
      setIsGenerating(true);

      try {
        // Generate the link
        const link = generatePaymentLink(address, {
          amount: params.amount,
          token: params.token || defaultToken,
          message: params.message,
          baseUrl: defaultBaseUrl,
        });

        // Generate QR code
        const qrResult = await generatePaymentQRCode(link.url, {
          size: qrSize,
        });

        return {
          ...link,
          qrCodeDataUrl: qrResult.dataUrl,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate link';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [address, defaultToken, defaultBaseUrl, qrSize]
  );

  /**
   * Parse a payment link URL
   */
  const parseLink = useCallback((url: string): ParsedPaymentLink => {
    return parsePaymentLink(url);
  }, []);

  /**
   * Generate QR code for an existing link
   */
  const generateQRCode = useCallback(
    async (link: PaymentLink): Promise<string> => {
      setIsGenerating(true);
      try {
        const qrResult = await generatePaymentQRCode(link.url, {
          size: qrSize,
        });
        return qrResult.dataUrl;
      } finally {
        setIsGenerating(false);
      }
    },
    [qrSize]
  );

  /**
   * Copy link to clipboard
   */
  const copyToClipboard = useCallback(
    async (link: PaymentLink): Promise<boolean> => {
      try {
        const text = formatPaymentLinkForSharing(link);
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to copy';
        setError(message);
        return false;
      }
    },
    []
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    generateLink,
    parseLink,
    recipientAddress: address,
    generateQRCode,
    isGenerating,
    copyToClipboard,
    error,
    clearError,
  };
}

/**
 * Hook to parse payment link from current URL
 *
 * @returns Parsed payment link or null
 *
 * @example
 * ```tsx
 * const parsed = usePaymentLinkFromUrl();
 * if (parsed?.valid) {
 *   // Pre-fill payment form
 *   setRecipient(parsed.recipient);
 *   setAmount(parsed.amount);
 * }
 * ```
 */
export function usePaymentLinkFromUrl(): ParsedPaymentLink | null {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.location) {
      return null;
    }

    const url = new URL(window.location.href);
    if (!url.searchParams.has('to')) {
      return null;
    }

    return parsePaymentLink(url.toString());
  }, []);
}
