/**
 * QR Code Generation Module
 *
 * Generate QR codes for payment links using the qrcode library.
 */

import QRCode from 'qrcode';

// ============================================
// Types
// ============================================

/** QR code generation options */
export interface QRCodeOptions {
  /** QR code size in pixels (default: 256) */
  size?: number;
  /** Error correction level (default: 'M') */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Margin in modules (default: 4) */
  margin?: number;
  /** Dark color (default: '#000000') */
  darkColor?: string;
  /** Light color (default: '#ffffff') */
  lightColor?: string;
}

/** QR code generation result */
export interface QRCodeResult {
  /** Data URL (base64 PNG) */
  dataUrl: string;
  /** SVG string */
  svg: string;
}

// ============================================
// Default Options
// ============================================

const DEFAULT_OPTIONS: Required<QRCodeOptions> = {
  size: 256,
  errorCorrectionLevel: 'M',
  margin: 4,
  darkColor: '#000000',
  lightColor: '#ffffff',
};

// ============================================
// QR Code Generation Functions
// ============================================

/**
 * Generate QR code as data URL (base64 PNG)
 *
 * @param content Content to encode in QR code
 * @param options QR code options
 * @returns Data URL string
 */
export async function generateQRCodeDataUrl(
  content: string,
  options?: QRCodeOptions
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return QRCode.toDataURL(content, {
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: {
      dark: opts.darkColor,
      light: opts.lightColor,
    },
  });
}

/**
 * Generate QR code as SVG string
 *
 * @param content Content to encode in QR code
 * @param options QR code options
 * @returns SVG string
 */
export async function generateQRCodeSVG(
  content: string,
  options?: QRCodeOptions
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return QRCode.toString(content, {
    type: 'svg',
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: {
      dark: opts.darkColor,
      light: opts.lightColor,
    },
  });
}

/**
 * Generate QR code as both data URL and SVG
 *
 * @param content Content to encode in QR code
 * @param options QR code options
 * @returns Object with both dataUrl and svg
 */
export async function generateQRCode(
  content: string,
  options?: QRCodeOptions
): Promise<QRCodeResult> {
  const [dataUrl, svg] = await Promise.all([
    generateQRCodeDataUrl(content, options),
    generateQRCodeSVG(content, options),
  ]);

  return { dataUrl, svg };
}

/**
 * Generate QR code for a payment link
 *
 * @param paymentUrl Payment URL to encode
 * @param options QR code options
 * @returns QR code result
 */
export async function generatePaymentQRCode(
  paymentUrl: string,
  options?: QRCodeOptions
): Promise<QRCodeResult> {
  return generateQRCode(paymentUrl, options);
}

// ============================================
// Validation
// ============================================

/**
 * Check if content length is valid for QR code
 * QR codes have a maximum capacity based on error correction level
 *
 * @param content Content to check
 * @param errorCorrectionLevel Error correction level
 * @returns Whether content fits in a QR code
 */
export function isValidQRCodeContent(
  content: string,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): boolean {
  // Maximum alphanumeric characters per error correction level
  const maxLength: Record<string, number> = {
    L: 4296,
    M: 3391,
    Q: 2420,
    H: 1852,
  };

  return content.length <= maxLength[errorCorrectionLevel];
}

/**
 * Estimate QR code version needed for content
 * Higher version = more modules = larger QR code
 *
 * @param contentLength Length of content to encode
 * @returns Estimated QR version (1-40)
 */
export function estimateQRVersion(contentLength: number): number {
  // Simplified version estimation for alphanumeric mode
  if (contentLength <= 25) return 1;
  if (contentLength <= 47) return 2;
  if (contentLength <= 77) return 3;
  if (contentLength <= 114) return 4;
  if (contentLength <= 154) return 5;
  if (contentLength <= 195) return 6;
  if (contentLength <= 224) return 7;
  if (contentLength <= 279) return 8;
  if (contentLength <= 335) return 9;
  if (contentLength <= 395) return 10;
  if (contentLength <= 512) return 12;
  if (contentLength <= 688) return 15;
  if (contentLength <= 858) return 18;
  if (contentLength <= 1108) return 22;
  if (contentLength <= 1407) return 27;
  if (contentLength <= 1838) return 33;
  return 40;
}

/**
 * Get recommended size for QR code based on content
 *
 * @param contentLength Length of content
 * @param baseSize Base size for version 1 (default: 128)
 * @returns Recommended size in pixels
 */
export function getRecommendedQRSize(
  contentLength: number,
  baseSize = 128
): number {
  const version = estimateQRVersion(contentLength);
  // Each version adds 4 modules, scale accordingly
  const modules = 21 + (version - 1) * 4;
  // At least 4 pixels per module for readability
  const minSize = modules * 4;
  return Math.max(baseSize, minSize);
}
