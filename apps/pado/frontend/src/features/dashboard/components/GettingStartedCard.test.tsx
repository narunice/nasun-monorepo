import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GettingStartedCard } from './GettingStartedCard';
import { FIRST_TRADE_STORAGE_KEY } from '../../trading/hooks/useFirstTradeCelebration';

const DISMISS_KEY = 'pado:gettingStartedDismissed';

// Mutable mock state
let mockWalletStatus = 'disconnected';
let mockIsZkConnected = false;
let mockBalance: { totalBalance: string; formattedBalance: string } | undefined;

vi.mock('@nasun/wallet', () => ({
  useWallet: () => ({ status: mockWalletStatus }),
  useZkLogin: () => ({ isConnected: mockIsZkConnected }),
  useBalance: () => ({ data: mockBalance }),
}));

function renderCard() {
  return render(
    <MemoryRouter>
      <GettingStartedCard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockWalletStatus = 'disconnected';
  mockIsZkConnected = false;
  mockBalance = undefined;
});

describe('GettingStartedCard', () => {
  // ========================================
  // Visibility
  // ========================================
  describe('visibility', () => {
    it('renders when wallet not connected and no steps complete', () => {
      renderCard();
      expect(screen.getByText('Getting Started')).toBeInTheDocument();
    });

    it('renders when wallet connected but not all steps done', () => {
      mockWalletStatus = 'unlocked';
      renderCard();
      expect(screen.getByText('Getting Started')).toBeInTheDocument();
    });

    it('returns null when all steps complete', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '1000000000', formattedBalance: '1.0' };
      localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));

      const { container } = renderCard();
      expect(container.innerHTML).toBe('');
    });

    it('returns null when dismissed via localStorage', () => {
      localStorage.setItem(DISMISS_KEY, 'true');
      const { container } = renderCard();
      expect(container.innerHTML).toBe('');
    });

    it('does not render when dismissed even if steps are incomplete', () => {
      localStorage.setItem(DISMISS_KEY, 'true');
      mockWalletStatus = 'unlocked';
      const { container } = renderCard();
      expect(container.innerHTML).toBe('');
    });
  });

  // ========================================
  // Step completion detection
  // ========================================
  describe('step completion', () => {
    it('shows 0/3 when nothing is done', () => {
      renderCard();
      expect(screen.getByText('0/3 completed')).toBeInTheDocument();
    });

    it('shows 1/3 when wallet connected via mnemonic', () => {
      mockWalletStatus = 'unlocked';
      renderCard();
      expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    });

    it('shows 1/3 when wallet connected via zkLogin', () => {
      mockIsZkConnected = true;
      renderCard();
      expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    });

    it('shows 2/3 when wallet connected and has balance', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '500000000', formattedBalance: '0.5' };
      renderCard();
      expect(screen.getByText('2/3 completed')).toBeInTheDocument();
    });

    it('treats balance of 0 as faucet step not complete', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '0', formattedBalance: '0' };
      renderCard();
      expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    });

    it('treats undefined balance as faucet step not complete', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = undefined;
      renderCard();
      expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    });

    it('shows 2/3 when wallet connected + first trade done but no balance (edge case)', () => {
      // Edge: user could have traded AND spent all balance
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '0', formattedBalance: '0' };
      localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));
      renderCard();
      expect(screen.getByText('2/3 completed')).toBeInTheDocument();
    });
  });

  // ========================================
  // Step descriptions
  // ========================================
  describe('step labels', () => {
    it('shows all step labels', () => {
      renderCard();
      expect(screen.getByText(/Create Wallet/)).toBeInTheDocument();
      expect(screen.getByText(/Get Test Tokens/)).toBeInTheDocument();
      expect(screen.getByText(/Make Your First Trade/)).toBeInTheDocument();
    });

    it('shows descriptions for incomplete steps', () => {
      renderCard();
      expect(screen.getByText('Set up your wallet to start trading')).toBeInTheDocument();
      expect(screen.getByText('Use the faucet in your wallet to get free tokens')).toBeInTheDocument();
      expect(screen.getByText('Enable Pado and place an order on the orderbook')).toBeInTheDocument();
    });

    it('hides description for completed steps', () => {
      mockWalletStatus = 'unlocked';
      renderCard();
      expect(screen.queryByText('Set up your wallet to start trading')).not.toBeInTheDocument();
    });

    it('applies line-through to completed step labels', () => {
      mockWalletStatus = 'unlocked';
      renderCard();
      const walletLabel = screen.getByText(/Create Wallet/);
      expect(walletLabel.className).toContain('line-through');
    });
  });

  // ========================================
  // Trade action button
  // ========================================
  describe('trade action button', () => {
    it('does not show "Go to Trade" when wallet not connected', () => {
      renderCard();
      expect(screen.queryByText(/Go to Trade/)).not.toBeInTheDocument();
    });

    it('does not show "Go to Trade" when wallet connected but no balance', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = undefined;
      renderCard();
      expect(screen.queryByText(/Go to Trade/)).not.toBeInTheDocument();
    });

    it('shows "Go to Trade" link when wallet connected AND has balance', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '1000000000', formattedBalance: '1.0' };
      renderCard();
      const link = screen.getByText(/Go to Trade/);
      expect(link.closest('a')).toHaveAttribute('href', '/markets/spot');
    });

    it('does not show "Go to Trade" if already traded', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '1000000000', formattedBalance: '1.0' };
      localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));
      // All steps complete → card not rendered
      const { container } = renderCard();
      expect(container.innerHTML).toBe('');
    });
  });

  // ========================================
  // Dismiss behavior
  // ========================================
  describe('dismiss', () => {
    it('dismisses card when X button clicked', () => {
      const { container } = renderCard();
      expect(screen.getByText('Getting Started')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Dismiss'));

      // Card should vanish
      expect(container.innerHTML).toBe('');
    });

    it('sets localStorage on dismiss', () => {
      renderCard();
      fireEvent.click(screen.getByLabelText('Dismiss'));
      expect(localStorage.getItem(DISMISS_KEY)).toBe('true');
    });

    it('stays dismissed across re-renders', () => {
      const { container, rerender } = render(
        <MemoryRouter><GettingStartedCard /></MemoryRouter>,
      );

      fireEvent.click(screen.getByLabelText('Dismiss'));
      expect(container.innerHTML).toBe('');

      rerender(<MemoryRouter><GettingStartedCard /></MemoryRouter>);
      expect(container.innerHTML).toBe('');
    });
  });

  // ========================================
  // Progress bar
  // ========================================
  describe('progress bar', () => {
    it('shows 0% width when no steps complete', () => {
      renderCard();
      const bar = document.querySelector('.bg-green-500.rounded-full') as HTMLElement;
      expect(bar).toBeTruthy();
      expect(bar.style.width).toBe('0%');
    });

    it('shows 33% width when 1 step complete', () => {
      mockWalletStatus = 'unlocked';
      renderCard();
      const bar = document.querySelector('.bg-green-500.rounded-full') as HTMLElement;
      // 1/3 = 33.333...%
      expect(bar.style.width).toContain('33');
    });

    it('shows 66% width when 2 steps complete', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '1000000000', formattedBalance: '1.0' };
      renderCard();
      const bar = document.querySelector('.bg-green-500.rounded-full') as HTMLElement;
      expect(bar.style.width).toContain('66');
    });
  });

  // ========================================
  // Edge cases
  // ========================================
  describe('edge cases', () => {
    it('handles locked wallet status (not disconnected, not unlocked)', () => {
      mockWalletStatus = 'locked';
      renderCard();
      // Locked wallet is not "connected"
      expect(screen.getByText('0/3 completed')).toBeInTheDocument();
    });

    it('handles very large balance correctly', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '99999999999999', formattedBalance: '99999.99' };
      renderCard();
      expect(screen.getByText('2/3 completed')).toBeInTheDocument();
    });

    it('handles negative balance string gracefully', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '-1', formattedBalance: '-0.000000001' };
      renderCard();
      // Number(-1) > 0 is false, so faucet step not complete
      expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    });

    it('updates hasTraded reactively when ORDER_FILL_EVENT fires', async () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: '1000000000', formattedBalance: '1.0' };
      renderCard();
      // Before event: 2/3 (wallet + faucet)
      expect(screen.getByText('2/3 completed')).toBeInTheDocument();

      // Simulate order fill event
      const { act } = await import('@testing-library/react');
      act(() => {
        localStorage.setItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));
        document.dispatchEvent(new CustomEvent('pado:order-filled', {
          detail: { price: 100, quantity: 1, side: 'buy', timestamp: Date.now() },
        }));
      });

      // After event: all steps complete → card hides
      expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
    });

    it('handles NaN balance gracefully', () => {
      mockWalletStatus = 'unlocked';
      mockBalance = { totalBalance: 'notanumber', formattedBalance: 'NaN' };
      renderCard();
      // Number('notanumber') is NaN, NaN > 0 is false
      expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    });
  });
});
