import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TPSLKeeperBadge } from './TPSLKeeperBadge';
import type { UseTradeCapResult } from '../hooks/useTradeCap';

// Mock useToast
vi.mock('@/components/common', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

function makeTradeCapResult(overrides: Partial<UseTradeCapResult> = {}): UseTradeCapResult {
  return {
    status: 'none',
    tradeCapId: null,
    keeperAddress: null,
    isKeeperAvailable: true,
    delegate: vi.fn().mockResolvedValue({ success: true }),
    revoke: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

// ========================================
// Rendering
// ========================================
describe('TPSLKeeperBadge', () => {
  it('renders nothing when keeper is not available', () => {
    const { container } = render(
      <TPSLKeeperBadge tradeCap={makeTradeCapResult({ isKeeperAvailable: false })} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows "Browser" when not delegated', () => {
    render(<TPSLKeeperBadge tradeCap={makeTradeCapResult()} />);
    expect(screen.getByText('Browser')).toBeTruthy();
  });

  it('shows "Server" when delegated', () => {
    render(
      <TPSLKeeperBadge tradeCap={makeTradeCapResult({ status: 'delegated' })} />
    );
    expect(screen.getByText('Server')).toBeTruthy();
  });

  it('shows "Processing..." when loading', () => {
    render(
      <TPSLKeeperBadge tradeCap={makeTradeCapResult({ status: 'loading' })} />
    );
    expect(screen.getByText('Processing...')).toBeTruthy();
  });

  // ========================================
  // Expanded panel
  // ========================================
  describe('expanded panel', () => {
    it('shows detail panel on click', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult()} />);
      fireEvent.click(screen.getByText('Browser'));
      expect(screen.getByText('TP/SL Execution Mode')).toBeTruthy();
    });

    it('shows "Browser Only" label when not delegated', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult()} />);
      fireEvent.click(screen.getByText('Browser'));
      expect(screen.getByText('Browser Only')).toBeTruthy();
    });

    it('shows "Server-Side" label when delegated', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult({ status: 'delegated' })} />);
      fireEvent.click(screen.getByText('Server'));
      expect(screen.getByText('Server-Side')).toBeTruthy();
    });

    it('shows toggle switch with correct ARIA attributes', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult()} />);
      fireEvent.click(screen.getByText('Browser'));

      const toggle = screen.getByRole('switch');
      expect(toggle).toBeTruthy();
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(toggle.getAttribute('aria-label')).toBe('Toggle server-side TP/SL execution');
    });

    it('toggle has aria-checked=true when delegated', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult({ status: 'delegated' })} />);
      fireEvent.click(screen.getByText('Server'));

      const toggle = screen.getByRole('switch');
      expect(toggle.getAttribute('aria-checked')).toBe('true');
    });

    it('toggle is disabled when loading', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult({ status: 'loading' })} />);
      fireEvent.click(screen.getByText('Processing...'));

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveProperty('disabled', true);
    });
  });

  // ========================================
  // Toggle action
  // ========================================
  describe('toggle action', () => {
    it('calls delegate when toggling from none to delegated', () => {
      const delegate = vi.fn().mockResolvedValue({ success: true });
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult({ delegate })} />);

      fireEvent.click(screen.getByText('Browser'));
      fireEvent.click(screen.getByRole('switch'));

      expect(delegate).toHaveBeenCalledOnce();
    });

    it('calls revoke when toggling from delegated to none', () => {
      const revoke = vi.fn().mockResolvedValue({ success: true });
      render(
        <TPSLKeeperBadge
          tradeCap={makeTradeCapResult({ status: 'delegated', revoke })}
        />
      );

      fireEvent.click(screen.getByText('Server'));
      fireEvent.click(screen.getByRole('switch'));

      expect(revoke).toHaveBeenCalledOnce();
    });
  });

  // ========================================
  // TradeCap ID display
  // ========================================
  describe('TradeCap ID display', () => {
    it('shows truncated TradeCap ID when delegated', () => {
      render(
        <TPSLKeeperBadge
          tradeCap={makeTradeCapResult({
            status: 'delegated',
            tradeCapId: '0x1234567890abcdef',
          })}
        />
      );

      fireEvent.click(screen.getByText('Server'));
      expect(screen.getByText(/TradeCap: 0x12345678\.\.\./)).toBeTruthy();
    });

    it('does not show TradeCap ID when not delegated', () => {
      render(<TPSLKeeperBadge tradeCap={makeTradeCapResult()} />);
      fireEvent.click(screen.getByText('Browser'));
      expect(screen.queryByText(/TradeCap:/)).toBeNull();
    });
  });

  // ========================================
  // Click outside
  // ========================================
  describe('click outside', () => {
    it('closes panel when clicking outside', () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <TPSLKeeperBadge tradeCap={makeTradeCapResult()} />
        </div>
      );

      // Open panel
      fireEvent.click(screen.getByText('Browser'));
      expect(screen.getByText('TP/SL Execution Mode')).toBeTruthy();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(screen.queryByText('TP/SL Execution Mode')).toBeNull();
    });
  });
});
