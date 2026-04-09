/**
 * TraderFillsTable Tests
 * Tests trade history rendering, buy/sell coloring, empty state, loading, edge cases.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TraderFillsTable } from './TraderFillsTable';
import type { TraderFill } from '../types';

function makeFill(overrides: Partial<TraderFill> = {}): TraderFill {
  return {
    txDigest: '0x' + 'f'.repeat(64),
    poolId: '0x' + 'p'.repeat(64),
    side: 'buy',
    price: '42000.50',
    baseQuantity: '0.5',
    quoteQuantity: '21000.25',
    timestamp: Date.now() - 60 * 1000,
    ...overrides,
  };
}

describe('TraderFillsTable', () => {
  // ========================================
  // Loading State
  // ========================================

  describe('loading state', () => {
    it('shows skeleton rows when loading', () => {
      const { container } = render(
        <TraderFillsTable fills={[]} isLoading={true} />,
      );
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders 5 skeleton rows', () => {
      const { container } = render(
        <TraderFillsTable fills={[]} isLoading={true} />,
      );
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(5);
    });

    it('does not show table when loading', () => {
      const { container } = render(
        <TraderFillsTable fills={[makeFill()]} isLoading={true} />,
      );
      expect(container.querySelector('table')).toBeNull();
    });
  });

  // ========================================
  // Empty State
  // ========================================

  describe('empty state', () => {
    it('shows "No trade history found" when empty', () => {
      render(<TraderFillsTable fills={[]} isLoading={false} />);
      expect(screen.getByText('No trade history found')).toBeTruthy();
    });
  });

  // ========================================
  // Table Headers
  // ========================================

  describe('table headers', () => {
    it('renders all column headers', () => {
      render(<TraderFillsTable fills={[makeFill()]} isLoading={false} />);
      expect(screen.getByText('Time')).toBeTruthy();
      expect(screen.getByText('Pool')).toBeTruthy();
      expect(screen.getByText('Side')).toBeTruthy();
      expect(screen.getByText('Price')).toBeTruthy();
      expect(screen.getByText('Total')).toBeTruthy();
    });
  });

  // ========================================
  // Data Rendering
  // ========================================

  describe('data rendering', () => {
    it('renders correct number of rows', () => {
      const fills = [
        makeFill({ txDigest: '0x1' }),
        makeFill({ txDigest: '0x2' }),
        makeFill({ txDigest: '0x3' }),
      ];
      const { container } = render(
        <TraderFillsTable fills={fills} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(3);
    });

    it('displays buy side in green', () => {
      render(<TraderFillsTable fills={[makeFill({ side: 'buy' })]} isLoading={false} />);
      const buySpan = screen.getByText('Buy');
      expect(buySpan.className).toContain('text-green-500');
    });

    it('displays sell side in red', () => {
      render(<TraderFillsTable fills={[makeFill({ side: 'sell' })]} isLoading={false} />);
      const sellSpan = screen.getByText('Sell');
      expect(sellSpan.className).toContain('text-red-500');
    });

    it('displays price with $ prefix', () => {
      render(
        <TraderFillsTable fills={[makeFill({ price: '42000.50' })]} isLoading={false} />,
      );
      expect(screen.getByText('$42000.50')).toBeTruthy();
    });

    it('displays quote quantity as total with $ prefix', () => {
      render(
        <TraderFillsTable fills={[makeFill({ quoteQuantity: '21000.25' })]} isLoading={false} />,
      );
      expect(screen.getByText('$21000.25')).toBeTruthy();
    });

    it('shortens long pool IDs', () => {
      const poolId = '0x' + 'abcdef'.repeat(11);
      const { container } = render(
        <TraderFillsTable fills={[makeFill({ poolId })]} isLoading={false} />,
      );
      const poolCell = container.querySelectorAll('td')[1];
      // shortenPoolId: first 6 chars + ... + last 4 chars
      expect(poolCell.textContent).toContain('0xabcd');
      expect(poolCell.textContent).toContain('...');
    });

    it('does not shorten short pool IDs', () => {
      const poolId = '0xabcd1234';
      const { container } = render(
        <TraderFillsTable fills={[makeFill({ poolId })]} isLoading={false} />,
      );
      const poolCell = container.querySelectorAll('td')[1];
      expect(poolCell.textContent).toBe('0xabcd1234');
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('handles fills with same txDigest but different index', () => {
      const fills = [
        makeFill({ txDigest: '0xsame', side: 'buy' }),
        makeFill({ txDigest: '0xsame', side: 'sell' }),
      ];
      const { container } = render(
        <TraderFillsTable fills={fills} isLoading={false} />,
      );
      // Key is `${fill.txDigest}-${i}` so no duplicate key issues
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });

    it('renders 50 fills (max limit)', () => {
      const fills = Array.from({ length: 50 }, (_, i) =>
        makeFill({ txDigest: `0x${i}`, timestamp: Date.now() - i * 60000 }),
      );
      const { container } = render(
        <TraderFillsTable fills={fills} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(50);
    });

    it('handles fill with zero price', () => {
      render(
        <TraderFillsTable fills={[makeFill({ price: '0' })]} isLoading={false} />,
      );
      expect(screen.getByText('$0')).toBeTruthy();
    });

    it('handles fill with zero quoteQuantity', () => {
      render(
        <TraderFillsTable fills={[makeFill({ quoteQuantity: '0' })]} isLoading={false} />,
      );
      // Two "$0" elements: price and total
      const zeros = screen.getAllByText('$0');
      expect(zeros.length).toBeGreaterThanOrEqual(1);
    });

    it('formats timestamp correctly', () => {
      // Use a known timestamp
      const ts = new Date('2026-03-15T14:30:00Z').getTime();
      const { container } = render(
        <TraderFillsTable fills={[makeFill({ timestamp: ts })]} isLoading={false} />,
      );
      const timeCell = container.querySelector('td')!;
      // Should contain month and day at minimum
      expect(timeCell.textContent).toContain('Mar');
      expect(timeCell.textContent).toContain('15');
    });
  });
});
