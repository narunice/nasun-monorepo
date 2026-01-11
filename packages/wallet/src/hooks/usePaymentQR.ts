/**
 * usePaymentQR Hook
 *
 * QR code generation for payment links.
 * Uses qrcode library for generation.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  generateQRCodeDataUrl,
  generateQRCodeSVG,
  isValidQRCodeContent,
  getRecommendedQRSize,
} from '../core/payment';
import type { QRCodeOptions } from '../core/payment/qr';

// ============================================
// Types
// ============================================

/**
 * Options for usePaymentQR hook
 */
export interface UsePaymentQROptions {
  /** QR code size in pixels */
  size?: number;
  /** Error correction level */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Margin (modules) */
  margin?: number;
  /** Auto-generate on mount with this content */
  initialContent?: string;
  /** Dark color for QR code */
  darkColor?: string;
  /** Light color for QR code */
  lightColor?: string;
}

/**
 * Result of usePaymentQR hook
 */
export interface UsePaymentQRResult {
  /** QR code data URL (base64 PNG) */
  dataUrl: string | null;
  /** QR code SVG string */
  svgString: string | null;
  /** Generate QR code from content */
  generate: (content: string) => Promise<void>;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Clear generated QR */
  clear: () => void;
  /** Current content being displayed */
  content: string | null;
  /** Recommended size for current content */
  recommendedSize: number;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for generating QR codes
 *
 * @param options QR code options
 *
 * @example
 * ```tsx
 * const { dataUrl, svgString, generate, isLoading, error } = usePaymentQR({
 *   size: 256,
 *   errorCorrectionLevel: 'M',
 * });
 *
 * // Generate QR code
 * useEffect(() => {
 *   generate('https://pado.nasun.io/send?to=0x...');
 * }, [generate]);
 *
 * // Display QR code
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error} />;
 * if (dataUrl) return <img src={dataUrl} alt="Payment QR Code" />;
 * ```
 */
export function usePaymentQR(options?: UsePaymentQROptions): UsePaymentQRResult {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [svgString, setSvgString] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [recommendedSize, setRecommendedSize] = useState(128);

  const qrOptions: QRCodeOptions = {
    size: options?.size || 256,
    errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
    margin: options?.margin || 4,
    darkColor: options?.darkColor || '#000000',
    lightColor: options?.lightColor || '#ffffff',
  };

  /**
   * Generate QR code from content
   */
  const generate = useCallback(
    async (newContent: string): Promise<void> => {
      if (!newContent) {
        setError('Content is required');
        return;
      }

      // Validate content length
      if (!isValidQRCodeContent(newContent, qrOptions.errorCorrectionLevel)) {
        setError('Content is too long for QR code');
        return;
      }

      setIsLoading(true);
      setError(null);
      setContent(newContent);

      // Calculate recommended size
      const recSize = getRecommendedQRSize(newContent.length, qrOptions.size);
      setRecommendedSize(recSize);

      try {
        // Generate both formats in parallel
        const [dataUrlResult, svgResult] = await Promise.all([
          generateQRCodeDataUrl(newContent, qrOptions),
          generateQRCodeSVG(newContent, qrOptions),
        ]);

        setDataUrl(dataUrlResult);
        setSvgString(svgResult);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate QR code';
        setError(message);
        setDataUrl(null);
        setSvgString(null);
      } finally {
        setIsLoading(false);
      }
    },
    [qrOptions.size, qrOptions.errorCorrectionLevel, qrOptions.margin, qrOptions.darkColor, qrOptions.lightColor]
  );

  /**
   * Clear generated QR code
   */
  const clear = useCallback(() => {
    setDataUrl(null);
    setSvgString(null);
    setContent(null);
    setError(null);
  }, []);

  // Auto-generate on mount if initialContent is provided
  useEffect(() => {
    if (options?.initialContent) {
      generate(options.initialContent);
    }
  }, [options?.initialContent, generate]);

  return {
    dataUrl,
    svgString,
    generate,
    isLoading,
    error,
    clear,
    content,
    recommendedSize,
  };
}

/**
 * Hook to generate QR code for a specific URL
 * Automatically regenerates when URL changes
 *
 * @param url URL to encode in QR code
 * @param options QR code options
 *
 * @example
 * ```tsx
 * const paymentUrl = `https://pado.nasun.io/send?to=${address}`;
 * const { dataUrl, isLoading } = useQRCodeForUrl(paymentUrl);
 *
 * if (isLoading) return <Spinner />;
 * return <img src={dataUrl} />;
 * ```
 */
export function useQRCodeForUrl(
  url: string | null | undefined,
  options?: Omit<UsePaymentQROptions, 'initialContent'>
): Omit<UsePaymentQRResult, 'generate' | 'clear'> {
  const { generate, clear, ...result } = usePaymentQR(options);

  useEffect(() => {
    if (url) {
      generate(url);
    } else {
      clear();
    }
  }, [url, generate, clear]);

  return result;
}
