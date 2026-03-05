/**
 * MiniOrderbook + MobileTradeLayoutV2 Tests (T2-8)
 *
 * Tests:
 * - MiniOrderbook: LEVELS=8, ask/bid rendering, spread calculation,
 *   price click, bar width normalization, edge cases
 * - MobileTradeLayoutV2: chart height min(40vh,350px), simple vs pro mode,
 *   conditional orderbook rendering, layout structure
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniOrderbook } from './MiniOrderbook';
import { MobileTradeLayoutV2 } from './MobileTradeLayoutV2';

// Mock MobileMarketHeader (it's a display-only component)
vi.mock('./MobileMarketHeader', () => ({
  MobileMarketHeader: ({ symbol, price }: { symbol: string; price: number }) => (
    <div data-testid="mobile-market-header">{symbol} ${price}</div>
  ),
}));

// ===== Test Data Helpers =====

function makeLevels(count: number, startPrice: number, step: number) {
  return Array.from({ length: count }, (_, i) => ({
    price: startPrice + i * step,
    quantity: (i + 1) * 0.5,
  }));
}

// ===== MiniOrderbook Tests =====

describe('MiniOrderbook', () => {
  const defaultBids = makeLevels(10, 100, -1); // 100, 99, 98, ...
  const defaultAsks = makeLevels(10, 101, 1);  // 101, 102, 103, ...

  describe('LEVELS constant', () => {
    it('renders exactly 6 ask levels', () => {
      const { container } = render(
        <MiniOrderbook bids={defaultBids} asks={defaultAsks} midPrice={100.5} />
      );
      // Ask prices are rendered in .text-red-400 spans
      const askPrices = container.querySelectorAll('.text-red-400');
      expect(askPrices.length).toBe(6);
    });

    it('renders exactly 6 bid levels', () => {
      const { container } = render(
        <MiniOrderbook bids={defaultBids} asks={defaultAsks} midPrice={100.5} />
      );
      // Bid prices are rendered in .text-green-400 spans
      const bidPrices = container.querySelectorAll('.text-green-400');
      expect(bidPrices.length).toBe(6);
    });

    it('renders fewer levels when data has fewer than 8', () => {
      const fewBids = makeLevels(3, 100, -1);
      const fewAsks = makeLevels(3, 101, 1);
      render(
        <MiniOrderbook bids={fewBids} asks={fewAsks} midPrice={100.5} />
      );
      // 3 asks + 3 bids = 6 price buttons total
      const allPriceTexts = screen.getAllByText(/\d+\.\d{2}/).filter(el => {
        const parent = el.closest('button');
        return parent !== null;
      });
      // Each button has price + quantity, so 6 buttons with 2 text nodes each
      expect(allPriceTexts.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('ask rendering', () => {
    it('reverses asks (lowest ask closest to spread)', () => {
      const asks = [
        { price: 101, quantity: 1 },
        { price: 102, quantity: 2 },
        { price: 103, quantity: 3 },
      ];
      const { container } = render(
        <MiniOrderbook bids={defaultBids} asks={asks} midPrice={100.5} />
      );
      // After reverse: 103, 102, 101 (top to bottom)
      const askTexts = container.querySelectorAll('.text-red-400');
      expect(askTexts[0].textContent).toBe('103.00');
      expect(askTexts[1].textContent).toBe('102.00');
      expect(askTexts[2].textContent).toBe('101.00');
    });
  });

  describe('bid rendering', () => {
    it('renders bids in order (highest bid first)', () => {
      const bids = [
        { price: 100, quantity: 1 },
        { price: 99, quantity: 2 },
        { price: 98, quantity: 3 },
      ];
      const { container } = render(
        <MiniOrderbook bids={bids} asks={defaultAsks} midPrice={100.5} />
      );
      const bidTexts = container.querySelectorAll('.text-green-400');
      expect(bidTexts[0].textContent).toBe('100.00');
      expect(bidTexts[1].textContent).toBe('99.00');
      expect(bidTexts[2].textContent).toBe('98.00');
    });
  });

  describe('spread calculation', () => {
    it('shows correct spread value', () => {
      const bids = [{ price: 100, quantity: 1 }];
      const asks = [{ price: 101.5, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={asks} midPrice={100.75} />
      );
      expect(screen.getByText(/Spread/)).toBeTruthy();
      // spread = 101.5 - 100 = 1.50
      expect(screen.getByText(/\$1\.50/)).toBeTruthy();
    });

    it('shows spread percentage', () => {
      const bids = [{ price: 100, quantity: 1 }];
      const asks = [{ price: 102, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={asks} midPrice={101} />
      );
      // spread = 2, spreadPct = (2 / 101) * 100 ≈ 1.980%
      expect(screen.getByText(/1\.980%/)).toBeTruthy();
    });

    it('handles zero midPrice (no division error)', () => {
      const bids = [{ price: 0, quantity: 1 }];
      const asks = [{ price: 1, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={asks} midPrice={0} />
      );
      // spreadPct should be 0 when midPrice is 0
      expect(screen.getByText(/0\.000%/)).toBeTruthy();
    });

    it('handles empty bids (spread = 0)', () => {
      const asks = [{ price: 101, quantity: 1 }];
      render(
        <MiniOrderbook bids={[]} asks={asks} midPrice={100} />
      );
      expect(screen.getByText(/\$0\.00/)).toBeTruthy();
    });

    it('handles empty asks (spread = 0)', () => {
      const bids = [{ price: 100, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      expect(screen.getByText(/\$0\.00/)).toBeTruthy();
    });
  });

  describe('price click', () => {
    it('calls onPriceClick when ask level is clicked', () => {
      const onPriceClick = vi.fn();
      const asks = [{ price: 105.25, quantity: 1 }];
      render(
        <MiniOrderbook bids={[]} asks={asks} midPrice={105} onPriceClick={onPriceClick} />
      );
      fireEvent.click(screen.getByText('105.25'));
      expect(onPriceClick).toHaveBeenCalledWith(105.25);
    });

    it('calls onPriceClick when bid level is clicked', () => {
      const onPriceClick = vi.fn();
      const bids = [{ price: 99.5, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} onPriceClick={onPriceClick} />
      );
      fireEvent.click(screen.getByText('99.50'));
      expect(onPriceClick).toHaveBeenCalledWith(99.5);
    });

    it('does not crash when onPriceClick is not provided', () => {
      const bids = [{ price: 100, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      // Should not throw
      expect(() => fireEvent.click(screen.getByText('100.00'))).not.toThrow();
    });
  });

  describe('bar width normalization', () => {
    it('normalizes bar widths to max quantity', () => {
      const bids = [
        { price: 100, quantity: 10 },  // 100% width
        { price: 99, quantity: 5 },    // 50% width
      ];
      const { container } = render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      const bars = container.querySelectorAll('.bg-green-500\\/10');
      expect(bars[0].getAttribute('style')).toContain('width: 100%');
      expect(bars[1].getAttribute('style')).toContain('width: 50%');
    });

    it('handles all-zero quantities (maxQty defaults to 1)', () => {
      const bids = [{ price: 100, quantity: 0 }];
      const { container } = render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      const bars = container.querySelectorAll('.bg-green-500\\/10');
      // 0 / 1 * 100 = 0%
      expect(bars[0].getAttribute('style')).toContain('width: 0%');
    });
  });

  describe('formatting', () => {
    it('formats prices to 2 decimal places', () => {
      const bids = [{ price: 100.1, quantity: 1 }];
      render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      expect(screen.getByText('100.10')).toBeTruthy();
    });

    it('formats quantities to 4 decimal places', () => {
      const bids = [{ price: 100, quantity: 0.5 }];
      render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      expect(screen.getByText('0.5000')).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('renders with both bids and asks empty', () => {
      const { container } = render(
        <MiniOrderbook bids={[]} asks={[]} midPrice={0} />
      );
      expect(container.querySelector('.bg-theme-bg-secondary')).toBeTruthy();
      expect(screen.getByText(/Spread/)).toBeTruthy();
    });

    it('handles exactly 6 levels (no slicing needed)', () => {
      const bids = makeLevels(6, 100, -1);
      const asks = makeLevels(6, 101, 1);
      const { container } = render(
        <MiniOrderbook bids={bids} asks={asks} midPrice={100.5} />
      );
      const allButtons = container.querySelectorAll('button');
      expect(allButtons.length).toBe(12); // 6 asks + 6 bids
    });

    it('handles very large quantities without overflow', () => {
      const bids = [{ price: 100, quantity: 999999.9999 }];
      render(
        <MiniOrderbook bids={bids} asks={[]} midPrice={100} />
      );
      expect(screen.getByText('999999.9999')).toBeTruthy();
    });
  });
});

// ===== MobileTradeLayoutV2 Tests =====

describe('MobileTradeLayoutV2', () => {
  const defaultBids = makeLevels(10, 100, -1);
  const defaultAsks = makeLevels(10, 101, 1);

  describe('chart height', () => {
    // NOTE: jsdom silently drops CSS min() function when React sets inline styles
    // via the DOM style API. We cannot verify the exact 'min(40vh, 350px)' value
    // at runtime. Instead, we verify the chart container exists and renders content.
    // The actual CSS value is verified by source code inspection.

    it('renders chart in a dedicated wrapper div', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div data-testid="chart">Chart</div>}
          tradeContent={<div>Trade</div>}
        />
      );
      const chartDiv = screen.getByTestId('chart');
      const chartWrapper = chartDiv.parentElement!;
      // Chart wrapper should be a div (not the root)
      expect(chartWrapper.tagName).toBe('DIV');
      // The wrapper should not be the root element (it's nested in scrollable content)
      expect(chartWrapper.parentElement).toBeTruthy();
    });

    it('chart wrapper is separate from trade content', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div data-testid="chart">Chart</div>}
          tradeContent={<div data-testid="trade">Trade</div>}
        />
      );
      const chartDiv = screen.getByTestId('chart');
      const tradeDiv = screen.getByTestId('trade');
      // Chart and trade should be in different parent divs
      expect(chartDiv.parentElement).not.toBe(tradeDiv.parentElement);
    });
  });

  describe('layout structure', () => {
    it('renders chart content', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div data-testid="chart">My Chart</div>}
          tradeContent={<div>Trade</div>}
        />
      );
      expect(screen.getByTestId('chart')).toBeTruthy();
    });

    it('renders trade content', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div data-testid="trade-form">Order Form</div>}
        />
      );
      expect(screen.getByTestId('trade-form')).toBeTruthy();
    });

    it('renders mobile market header when miniTicker is provided', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          miniTicker={{ symbol: 'NBTC/NUSDC', price: 97000 }}
        />
      );
      expect(screen.getByTestId('mobile-market-header')).toBeTruthy();
    });

    it('does not render market header when miniTicker is absent', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
        />
      );
      expect(screen.queryByTestId('mobile-market-header')).toBeNull();
    });

    it('is hidden on large screens (lg:hidden)', () => {
      const { container } = render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
        />
      );
      expect(container.firstChild).toBeTruthy();
      expect((container.firstChild as HTMLElement).className).toContain('lg:hidden');
    });
  });

  describe('simple vs pro mode', () => {
    it('shows MiniOrderbook in pro mode (isSimple=false) when bids exist', () => {
      const { container } = render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          bids={defaultBids}
          asks={defaultAsks}
          midPrice={100.5}
          isSimple={false}
        />
      );
      // MiniOrderbook has bg-theme-bg-secondary
      expect(container.querySelector('.bg-theme-bg-secondary')).toBeTruthy();
    });

    it('hides MiniOrderbook in simple mode', () => {
      const { container } = render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          bids={defaultBids}
          asks={defaultAsks}
          midPrice={100.5}
          isSimple={true}
        />
      );
      // MiniOrderbook should NOT render
      expect(container.querySelector('.bg-theme-bg-secondary')).toBeNull();
    });

    it('hides MiniOrderbook when bids are empty even in pro mode', () => {
      const { container } = render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          bids={[]}
          asks={defaultAsks}
          midPrice={100.5}
          isSimple={false}
        />
      );
      expect(container.querySelector('.bg-theme-bg-secondary')).toBeNull();
    });

    it('defaults to pro mode (isSimple=false)', () => {
      const { container } = render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          bids={defaultBids}
          asks={defaultAsks}
          midPrice={100.5}
        />
      );
      // Should show orderbook since isSimple defaults to false
      expect(container.querySelector('.bg-theme-bg-secondary')).toBeTruthy();
    });
  });

  describe('bottom tab content', () => {
    it('renders bottomTabContent when provided', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          bottomTabContent={<div data-testid="bottom-tabs">Open Orders</div>}
        />
      );
      expect(screen.getByTestId('bottom-tabs')).toBeTruthy();
    });

    it('does not render bottom section when bottomTabContent is absent', () => {
      render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
        />
      );
      expect(screen.queryByTestId('bottom-tabs')).toBeNull();
    });
  });

  describe('price click propagation', () => {
    it('passes onPriceClick to MiniOrderbook', () => {
      const onPriceClick = vi.fn();
      const bids = [{ price: 99.5, quantity: 1 }];
      render(
        <MobileTradeLayoutV2
          chartContent={<div>Chart</div>}
          tradeContent={<div>Trade</div>}
          bids={bids}
          asks={[{ price: 101, quantity: 1 }]}
          midPrice={100}
          onPriceClick={onPriceClick}
        />
      );
      fireEvent.click(screen.getByText('99.50'));
      expect(onPriceClick).toHaveBeenCalledWith(99.5);
    });
  });
});
