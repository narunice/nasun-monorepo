/**
 * Phase B — Mobile UX E2E Tests
 *
 * Validates:
 * 7. Sticky Buy/Sell buttons (MobileBottomBar)
 * 8. Full-screen chart mode
 * 9. Mobile orderbook level count (6 levels)
 * 10. Touch target 44px audit
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomBar } from './MobileBottomBar';
import { MiniOrderbook } from './MiniOrderbook';
import { MobileMarketHeader } from './MobileMarketHeader';

// ======================================================
// 7. Sticky Buy/Sell Buttons (MobileBottomBar)
// ======================================================

describe('Phase B.7 — MobileBottomBar (Sticky Buy/Sell)', () => {
  it('renders both Buy and Sell buttons', () => {
    render(<MobileBottomBar onTradeClick={vi.fn()} />);
    expect(screen.getByText('Buy')).toBeTruthy();
    expect(screen.getByText('Sell')).toBeTruthy();
  });

  it('has fixed positioning at bottom', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain('fixed');
    expect(bar.className).toContain('bottom-14');
  });

  it('is hidden on md+ screens', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain('md:hidden');
  });

  it('has proper z-index stacking', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain('z-40');
  });

  it('calls onTradeClick("buy") when Buy is clicked', () => {
    const handler = vi.fn();
    render(<MobileBottomBar onTradeClick={handler} />);
    fireEvent.click(screen.getByText('Buy'));
    expect(handler).toHaveBeenCalledWith('buy');
  });

  it('calls onTradeClick("sell") when Sell is clicked', () => {
    const handler = vi.fn();
    render(<MobileBottomBar onTradeClick={handler} />);
    fireEvent.click(screen.getByText('Sell'));
    expect(handler).toHaveBeenCalledWith('sell');
  });

  it('Buy button has green gradient styling', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const buyBtn = container.querySelectorAll('button')[0];
    expect(buyBtn.className).toContain('from-green-600');
    expect(buyBtn.className).toContain('to-green-700');
  });

  it('Sell button has red gradient styling', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const sellBtn = container.querySelectorAll('button')[1];
    expect(sellBtn.className).toContain('from-red-600');
    expect(sellBtn.className).toContain('to-red-700');
  });

  it('buttons have adequate touch target height (py-3.5 = ~44px+)', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('py-3.5');
    }
  });

  it('buttons have shadow for depth', () => {
    const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('shadow-sm');
    }
  });
});

// ======================================================
// 8. Full-screen Chart (MobileMarketHeader expand button)
// ======================================================

describe('Phase B.8 — Full-screen Chart Button', () => {
  it('renders expand button when onExpandChart is provided', () => {
    render(
      <MobileMarketHeader
        symbol="NBTC/NUSDC"
        price={97000}
        onExpandChart={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Expand chart')).toBeTruthy();
  });

  it('does not render expand button when onExpandChart is absent', () => {
    render(
      <MobileMarketHeader symbol="NBTC/NUSDC" price={97000} />
    );
    expect(screen.queryByLabelText('Expand chart')).toBeNull();
  });

  it('calls onExpandChart when expand button is clicked', () => {
    const handler = vi.fn();
    render(
      <MobileMarketHeader
        symbol="NBTC/NUSDC"
        price={97000}
        onExpandChart={handler}
      />
    );
    fireEvent.click(screen.getByLabelText('Expand chart'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('expand button has adequate touch target (p-3)', () => {
    render(
      <MobileMarketHeader
        symbol="NBTC/NUSDC"
        price={97000}
        onExpandChart={vi.fn()}
      />
    );
    const btn = screen.getByLabelText('Expand chart');
    expect(btn.className).toContain('p-3');
  });

  it('header is sticky positioned', () => {
    const { container } = render(
      <MobileMarketHeader symbol="NBTC/NUSDC" price={97000} />
    );
    const header = container.firstChild as HTMLElement;
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });

  it('displays market symbol', () => {
    render(<MobileMarketHeader symbol="NBTC/NUSDC" price={97000} />);
    expect(screen.getByText('NBTC/NUSDC')).toBeTruthy();
  });

  it('displays formatted price', () => {
    render(<MobileMarketHeader symbol="NBTC/NUSDC" price={97000} />);
    expect(screen.getByText('$97,000')).toBeTruthy();
  });

  it('shows positive 24h change in green', () => {
    const { container } = render(
      <MobileMarketHeader symbol="NBTC/NUSDC" price={97000} priceChange24h={2.5} />
    );
    const changeEl = screen.getByText('+2.5%');
    expect(changeEl.className).toContain('text-green-500');
  });

  it('shows negative 24h change in red', () => {
    render(
      <MobileMarketHeader symbol="NBTC/NUSDC" price={97000} priceChange24h={-1.3} />
    );
    const changeEl = screen.getByText('-1.3%');
    expect(changeEl.className).toContain('text-red-500');
  });
});

// ======================================================
// 9. Mobile Orderbook Level Count
// ======================================================

describe('Phase B.9 — MiniOrderbook Level Count', () => {
  function makeLevels(count: number, startPrice: number, step: number) {
    return Array.from({ length: count }, (_, i) => ({
      price: startPrice + i * step,
      quantity: (i + 1) * 0.5,
    }));
  }

  it('renders exactly 6 ask levels from 10 input levels', () => {
    const { container } = render(
      <MiniOrderbook
        bids={makeLevels(10, 100, -1)}
        asks={makeLevels(10, 101, 1)}
        midPrice={100.5}
      />
    );
    const askPrices = container.querySelectorAll('.text-red-400');
    expect(askPrices.length).toBe(6);
  });

  it('renders exactly 6 bid levels from 10 input levels', () => {
    const { container } = render(
      <MiniOrderbook
        bids={makeLevels(10, 100, -1)}
        asks={makeLevels(10, 101, 1)}
        midPrice={100.5}
      />
    );
    const bidPrices = container.querySelectorAll('.text-green-400');
    expect(bidPrices.length).toBe(6);
  });

  it('renders fewer than 6 when input has fewer levels', () => {
    const { container } = render(
      <MiniOrderbook
        bids={makeLevels(3, 100, -1)}
        asks={makeLevels(2, 101, 1)}
        midPrice={100.5}
      />
    );
    const askPrices = container.querySelectorAll('.text-red-400');
    const bidPrices = container.querySelectorAll('.text-green-400');
    expect(askPrices.length).toBe(2);
    expect(bidPrices.length).toBe(3);
  });
});

// ======================================================
// 10. Touch Target 44px Audit
// ======================================================

describe('Phase B.10 — Touch Target 44px', () => {
  describe('MiniOrderbook rows', () => {
    it('each row has min-h-[44px]', () => {
      const bids = [{ price: 100, quantity: 1 }];
      const { container } = render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      const buttons = container.querySelectorAll('button');
      for (const btn of buttons) {
        expect(btn.className).toContain('min-h-[44px]');
      }
    });
  });

  describe('MobileBottomBar buttons', () => {
    it('Buy/Sell buttons have py-3.5 (44px+)', () => {
      const { container } = render(<MobileBottomBar onTradeClick={vi.fn()} />);
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(2);
      for (const btn of buttons) {
        expect(btn.className).toContain('py-3.5');
      }
    });
  });

  describe('MobileMarketHeader expand button', () => {
    it('has p-3 padding (44px+ with 16px icon)', () => {
      render(
        <MobileMarketHeader
          symbol="NBTC/NUSDC"
          price={97000}
          onExpandChart={vi.fn()}
        />
      );
      const btn = screen.getByLabelText('Expand chart');
      expect(btn.className).toContain('p-3');
    });
  });
});
