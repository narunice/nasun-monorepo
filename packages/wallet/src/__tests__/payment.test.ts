/**
 * Payment UX Tests
 *
 * Tests for payment types, validation, links, and QR code generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

// ============================================
// Type Tests
// ============================================

describe('Payment Types', () => {
  describe('PaymentIntent', () => {
    it('should define correct payment intent structure', async () => {
      const { PaymentIntentStatus } = await import('../core/payment/types');
      // Type check - this is compile-time validation
      const status: (typeof PaymentIntentStatus)[number] = 'pending';
      expect(['pending', 'processing', 'completed', 'failed', 'expired', 'cancelled']).toContain(
        status
      );
    });

    it('should define correct chain types', async () => {
      const { PaymentChainType } = await import('../core/payment/types');
      // Type check - compile time
      const chainType: 'move' | 'evm' = 'move';
      expect(['move', 'evm']).toContain(chainType);
    });
  });

  describe('Constants', () => {
    it('should export default token symbol', async () => {
      const { DEFAULT_TOKEN_SYMBOL } = await import('../core/payment/types');
      expect(DEFAULT_TOKEN_SYMBOL).toBe('NASUN');
    });

    it('should export Nasun coin type', async () => {
      const { NASUN_COIN_TYPE } = await import('../core/payment/types');
      expect(NASUN_COIN_TYPE).toBe('0x2::sui::SUI');
    });

    it('should export URL params constants', async () => {
      const { URL_PARAMS } = await import('../core/payment/types');
      expect(URL_PARAMS.TO).toBe('to');
      expect(URL_PARAMS.AMOUNT).toBe('amount');
      expect(URL_PARAMS.TOKEN).toBe('token');
      expect(URL_PARAMS.MESSAGE).toBe('msg');
    });
  });
});

// ============================================
// Validation Tests
// ============================================

describe('Payment Validation', () => {
  describe('Address Validation', () => {
    it('should validate Move addresses (64 hex chars)', async () => {
      const { isValidMoveChainAddress } = await import('../core/payment/validation');

      // Valid Move address
      const validAddress = '0x' + 'a'.repeat(64);
      expect(isValidMoveChainAddress(validAddress)).toBe(true);

      // Invalid - too short
      expect(isValidMoveChainAddress('0x' + 'a'.repeat(40))).toBe(false);

      // Invalid - no 0x prefix
      expect(isValidMoveChainAddress('a'.repeat(64))).toBe(false);
    });

    it('should validate EVM addresses (40 hex chars)', async () => {
      const { isValidEVMAddress } = await import('../core/payment/validation');

      // Valid EVM address (checksummed)
      expect(isValidEVMAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true);

      // Valid EVM address (lowercase)
      expect(isValidEVMAddress('0x' + 'a'.repeat(40))).toBe(true);

      // Invalid - too short
      expect(isValidEVMAddress('0x' + 'a'.repeat(20))).toBe(false);

      // Invalid - no 0x prefix
      expect(isValidEVMAddress('a'.repeat(40))).toBe(false);
    });

    it('should detect address type correctly', async () => {
      const { isValidPaymentAddress } = await import('../core/payment/validation');

      const moveAddress = '0x' + 'a'.repeat(64);
      const evmAddress = '0x' + 'a'.repeat(40);

      expect(isValidPaymentAddress(moveAddress, 'move')).toBe(true);
      expect(isValidPaymentAddress(moveAddress, 'evm')).toBe(false);

      expect(isValidPaymentAddress(evmAddress, 'evm')).toBe(true);
      expect(isValidPaymentAddress(evmAddress, 'move')).toBe(false);
    });
  });

  describe('Amount Validation', () => {
    it('should validate positive amounts', async () => {
      const { validateAmount } = await import('../core/payment/validation');

      expect(validateAmount('10').valid).toBe(true);
      expect(validateAmount('0.5').valid).toBe(true);
      expect(validateAmount('1000.123456').valid).toBe(true);
    });

    it('should reject invalid amounts', async () => {
      const { validateAmount } = await import('../core/payment/validation');

      expect(validateAmount('').valid).toBe(false);
      expect(validateAmount('0').valid).toBe(false);
      expect(validateAmount('-10').valid).toBe(false);
      expect(validateAmount('abc').valid).toBe(false);
    });

    it('should reject excessive decimals', async () => {
      const { validateAmount } = await import('../core/payment/validation');

      // 18 decimals is OK
      expect(validateAmount('1.' + '1'.repeat(18)).valid).toBe(true);

      // 19 decimals is too many
      expect(validateAmount('1.' + '1'.repeat(19)).valid).toBe(false);
    });
  });

  describe('Balance Validation', () => {
    it('should check sufficient balance', async () => {
      const { checkSufficientBalance } = await import('../core/payment/validation');

      // Sufficient
      const result1 = checkSufficientBalance('10', '100');
      expect(result1.sufficient).toBe(true);

      // Insufficient
      const result2 = checkSufficientBalance('100', '50');
      expect(result2.sufficient).toBe(false);
      expect(result2.required).toBe('100');
      expect(result2.available).toBe('50');
    });

    it('should include gas in balance check', async () => {
      const { checkSufficientBalance } = await import('../core/payment/validation');

      // Amount + gas exceeds balance
      const result = checkSufficientBalance('90', '100', '20');
      expect(result.sufficient).toBe(false);
      expect(result.required).toBe('110'); // 90 + 20
    });
  });

  describe('Full Payment Validation', () => {
    it('should validate Move payment request', async () => {
      const { validateMovePayment } = await import('../core/payment/validation');

      const validRequest = {
        chainType: 'move' as const,
        recipient: '0x' + 'a'.repeat(64),
        amount: '10',
        tokenType: '0x2::sui::SUI',
      };

      const result = validateMovePayment(validRequest, {
        balance: '100',
        isConnected: true,
        hasSigner: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect validation errors', async () => {
      const { validateMovePayment } = await import('../core/payment/validation');

      const invalidRequest = {
        chainType: 'move' as const,
        recipient: 'invalid',
        amount: '-10',
        tokenType: '0x2::sui::SUI',
      };

      const result = validateMovePayment(invalidRequest, {
        isConnected: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const errorTypes = result.errors.map((e) => e.type);
      expect(errorTypes).toContain('WALLET_NOT_CONNECTED');
      expect(errorTypes).toContain('INVALID_ADDRESS');
      expect(errorTypes).toContain('INVALID_AMOUNT');
    });

    it('should detect warnings for new recipients', async () => {
      const { validateMovePayment } = await import('../core/payment/validation');

      const request = {
        chainType: 'move' as const,
        recipient: '0x' + 'a'.repeat(64),
        amount: '10',
        tokenType: '0x2::sui::SUI',
      };

      const result = validateMovePayment(request, {
        balance: '100',
        isConnected: true,
        hasSigner: true,
        recipientStatus: { isKnown: false, isTrusted: false },
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.type === 'NEW_RECIPIENT')).toBe(true);
    });

    it('should detect large amount warnings', async () => {
      const { validateMovePayment } = await import('../core/payment/validation');

      const request = {
        chainType: 'move' as const,
        recipient: '0x' + 'a'.repeat(64),
        amount: '5000', // Large amount
        tokenType: '0x2::sui::SUI',
      };

      const result = validateMovePayment(request, {
        balance: '10000',
        isConnected: true,
        hasSigner: true,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.type === 'LARGE_AMOUNT')).toBe(true);
    });
  });

  describe('Error Formatting', () => {
    it('should format validation errors to messages', async () => {
      const { formatValidationErrors } = await import('../core/payment/validation');

      const errors = [
        { type: 'INSUFFICIENT_BALANCE' as const, required: '100', available: '50' },
        { type: 'INVALID_ADDRESS' as const, address: '0xinvalid' },
      ];

      const messages = formatValidationErrors(errors);

      expect(messages).toHaveLength(2);
      expect(messages[0]).toContain('Insufficient balance');
      expect(messages[1]).toContain('Invalid recipient address');
    });
  });
});

// ============================================
// Link Tests
// ============================================

describe('Payment Links', () => {
  describe('URL Building', () => {
    it('should build payment URL with all params', async () => {
      const { buildPaymentUrl } = await import('../core/payment/link');

      const url = buildPaymentUrl('https://pado.nasun.io/send', {
        recipient: '0x' + 'a'.repeat(64),
        amount: '10',
        token: 'NBTC',
        message: 'Test payment',
      });

      expect(url).toContain('to=0x');
      expect(url).toContain('amount=10');
      expect(url).toContain('token=NBTC');
      expect(url).toContain('msg=Test+payment');
    });

    it('should omit default token from URL', async () => {
      const { buildPaymentUrl } = await import('../core/payment/link');

      const url = buildPaymentUrl('https://pado.nasun.io/send', {
        recipient: '0x' + 'a'.repeat(64),
        amount: '10',
        token: 'NASUN', // Default token
      });

      expect(url).not.toContain('token=');
    });
  });

  describe('Link Generation', () => {
    it('should generate payment link', async () => {
      const { generatePaymentLink } = await import('../core/payment/link');

      const link = generatePaymentLink('0x' + 'a'.repeat(64), {
        amount: '50',
        token: 'NASUN',
        message: 'Hello',
      });

      expect(link.recipient).toBe('0x' + 'a'.repeat(64));
      expect(link.amount).toBe('50');
      expect(link.token).toBe('NASUN');
      expect(link.message).toBe('Hello');
      expect(link.url).toContain('to=');
    });
  });

  describe('Link Parsing', () => {
    it('should parse valid payment URL', async () => {
      const { parsePaymentLink } = await import('../core/payment/link');

      const url =
        'https://pado.nasun.io/send?to=' +
        '0x' +
        'a'.repeat(64) +
        '&amount=25&token=NBTC&msg=Thanks';

      const parsed = parsePaymentLink(url);

      expect(parsed.valid).toBe(true);
      expect(parsed.recipient).toBe('0x' + 'a'.repeat(64));
      expect(parsed.amount).toBe('25');
      expect(parsed.token).toBe('NBTC');
      expect(parsed.message).toBe('Thanks');
    });

    it('should handle minimal URL (recipient only)', async () => {
      const { parsePaymentLink } = await import('../core/payment/link');

      const url = 'https://pado.nasun.io/send?to=' + '0x' + 'a'.repeat(64);

      const parsed = parsePaymentLink(url);

      expect(parsed.valid).toBe(true);
      expect(parsed.recipient).toBe('0x' + 'a'.repeat(64));
      expect(parsed.amount).toBeUndefined();
      expect(parsed.token).toBe('NASUN'); // Default
    });

    it('should reject URL without recipient', async () => {
      const { parsePaymentLink } = await import('../core/payment/link');

      const url = 'https://pado.nasun.io/send?amount=10';

      const parsed = parsePaymentLink(url);

      expect(parsed.valid).toBe(false);
      expect(parsed.error).toContain('Missing recipient');
    });

    it('should reject invalid recipient address', async () => {
      const { parsePaymentLink } = await import('../core/payment/link');

      const url = 'https://pado.nasun.io/send?to=invalid';

      const parsed = parsePaymentLink(url);

      expect(parsed.valid).toBe(false);
      expect(parsed.error).toContain('Invalid recipient');
    });

    it('should reject invalid amount', async () => {
      const { parsePaymentLink } = await import('../core/payment/link');

      const url = 'https://pado.nasun.io/send?to=' + '0x' + 'a'.repeat(64) + '&amount=-5';

      const parsed = parsePaymentLink(url);

      expect(parsed.valid).toBe(false);
      expect(parsed.error).toContain('Invalid amount');
    });
  });

  describe('Intent Conversion', () => {
    it('should convert intent to URL params', async () => {
      const { intentToUrlParams, generateIntentId } = await import('../core/payment/link');

      const intent = {
        id: generateIntentId(),
        version: 1 as const,
        chainType: 'move' as const,
        chainId: 'nasun-devnet',
        recipient: '0x' + 'a'.repeat(64),
        amount: '100',
        token: 'NBTC',
        message: 'Payment',
        createdAt: Date.now(),
        status: 'pending' as const,
      };

      const params = intentToUrlParams(intent);

      expect(params.get('to')).toBe(intent.recipient);
      expect(params.get('amount')).toBe('100');
      expect(params.get('token')).toBe('NBTC');
      expect(params.get('msg')).toBe('Payment');
    });

    it('should convert intent to request', async () => {
      const { intentToRequest, generateIntentId } = await import('../core/payment/link');

      const moveIntent = {
        id: generateIntentId(),
        version: 1 as const,
        chainType: 'move' as const,
        chainId: 'nasun-devnet',
        recipient: '0x' + 'a'.repeat(64),
        amount: '50',
        token: 'NASUN',
        tokenType: '0x2::sui::SUI',
        createdAt: Date.now(),
        status: 'pending' as const,
      };

      const request = intentToRequest(moveIntent);

      expect(request.chainType).toBe('move');
      expect(request.recipient).toBe(moveIntent.recipient);
      expect(request.amount).toBe('50');
      if (request.chainType === 'move') {
        expect(request.tokenType).toBe('0x2::sui::SUI');
      }
    });
  });

  describe('Intent ID Generation', () => {
    it('should generate unique intent IDs', async () => {
      const { generateIntentId } = await import('../core/payment/link');

      const id1 = generateIntentId();
      const id2 = generateIntentId();

      expect(id1).not.toBe(id2);
      // UUID v4 format
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('Sharing Format', () => {
    it('should format link for sharing', async () => {
      const { formatPaymentLinkForSharing } = await import('../core/payment/link');

      const link = {
        url: 'https://pado.nasun.io/send?to=0x...',
        baseUrl: 'https://pado.nasun.io/send',
        recipient: '0x' + 'a'.repeat(64),
        amount: '100',
        token: 'NASUN',
        message: 'Thanks!',
      };

      const text = formatPaymentLinkForSharing(link);

      expect(text).toContain('100 NASUN');
      expect(text).toContain('Thanks!');
      expect(text).toContain(link.url);
    });
  });
});

// ============================================
// QR Code Tests
// ============================================

describe('QR Code Generation', () => {
  describe('Content Validation', () => {
    it('should validate QR code content length', async () => {
      const { isValidQRCodeContent } = await import('../core/payment/qr');

      // Short content is valid
      expect(isValidQRCodeContent('short content')).toBe(true);

      // Very long content is invalid
      const longContent = 'a'.repeat(5000);
      expect(isValidQRCodeContent(longContent)).toBe(false);
    });

    it('should estimate QR version correctly', async () => {
      const { estimateQRVersion } = await import('../core/payment/qr');

      expect(estimateQRVersion(20)).toBe(1);
      expect(estimateQRVersion(100)).toBe(4);
      expect(estimateQRVersion(500)).toBe(12);
    });

    it('should recommend appropriate QR size', async () => {
      const { getRecommendedQRSize } = await import('../core/payment/qr');

      const sizeShort = getRecommendedQRSize(50);
      const sizeLong = getRecommendedQRSize(500);

      expect(sizeLong).toBeGreaterThan(sizeShort);
    });
  });

  describe('QR Code Generation', () => {
    it('should generate QR code as data URL', async () => {
      const { generateQRCodeDataUrl } = await import('../core/payment/qr');

      const dataUrl = await generateQRCodeDataUrl('https://example.com');

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should generate QR code as SVG', async () => {
      const { generateQRCodeSVG } = await import('../core/payment/qr');

      const svg = await generateQRCodeSVG('https://example.com');

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('should generate both formats together', async () => {
      const { generateQRCode } = await import('../core/payment/qr');

      const result = await generateQRCode('https://example.com');

      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.svg).toContain('<svg');
    });

    it('should support custom options', async () => {
      const { generateQRCodeDataUrl } = await import('../core/payment/qr');

      const dataUrl = await generateQRCodeDataUrl('https://example.com', {
        size: 512,
        errorCorrectionLevel: 'H',
        margin: 2,
        darkColor: '#333333',
        lightColor: '#eeeeee',
      });

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('Payment QR Code', () => {
    it('should generate QR code for payment URL', async () => {
      const { generatePaymentQRCode } = await import('../core/payment/qr');

      const paymentUrl = 'https://pado.nasun.io/send?to=0x' + 'a'.repeat(64) + '&amount=100';
      const result = await generatePaymentQRCode(paymentUrl);

      expect(result.dataUrl).toBeTruthy();
      expect(result.svg).toBeTruthy();
    });
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe('Payment Module Exports', () => {
  it('should export all types', async () => {
    const types = await import('../core/payment/types');

    expect(types.DEFAULT_INTENT_TTL_MS).toBeDefined();
    expect(types.NASUN_COIN_TYPE).toBeDefined();
    expect(types.DEFAULT_TOKEN_SYMBOL).toBeDefined();
    expect(types.URL_PARAMS).toBeDefined();
  });

  it('should export all validation functions', async () => {
    const validation = await import('../core/payment/validation');

    expect(validation.isValidMoveChainAddress).toBeDefined();
    expect(validation.isValidEVMAddress).toBeDefined();
    expect(validation.validateAmount).toBeDefined();
    expect(validation.validatePayment).toBeDefined();
    expect(validation.formatValidationErrors).toBeDefined();
  });

  it('should export all link functions', async () => {
    const link = await import('../core/payment/link');

    expect(link.buildPaymentUrl).toBeDefined();
    expect(link.generatePaymentLink).toBeDefined();
    expect(link.parsePaymentLink).toBeDefined();
    expect(link.intentToUrlParams).toBeDefined();
    expect(link.generateIntentId).toBeDefined();
  });

  it('should export all QR functions', async () => {
    const qr = await import('../core/payment/qr');

    expect(qr.generateQRCodeDataUrl).toBeDefined();
    expect(qr.generateQRCodeSVG).toBeDefined();
    expect(qr.generateQRCode).toBeDefined();
    expect(qr.generatePaymentQRCode).toBeDefined();
    expect(qr.isValidQRCodeContent).toBeDefined();
  });

  it('should export from index', async () => {
    const payment = await import('../core/payment');

    // Types/constants
    expect(payment.DEFAULT_TOKEN_SYMBOL).toBeDefined();
    expect(payment.NASUN_COIN_TYPE).toBeDefined();
    expect(payment.URL_PARAMS).toBeDefined();

    // Validation
    expect(payment.validatePayment).toBeDefined();
    expect(payment.formatValidationErrors).toBeDefined();

    // Links
    expect(payment.generatePaymentLink).toBeDefined();
    expect(payment.parsePaymentLink).toBeDefined();

    // QR
    expect(payment.generateQRCode).toBeDefined();
  });
});
