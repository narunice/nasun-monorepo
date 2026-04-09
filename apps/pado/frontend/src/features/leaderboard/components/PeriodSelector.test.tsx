/**
 * PeriodSelector Tests
 * Tests period button rendering, selection highlighting, and callback.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeriodSelector } from './PeriodSelector';
import type { Period } from '../types';

describe('PeriodSelector', () => {
  it('renders all four period buttons', () => {
    render(<PeriodSelector selected="7d" onSelect={vi.fn()} />);
    expect(screen.getByText('24H')).toBeTruthy();
    expect(screen.getByText('7D')).toBeTruthy();
    expect(screen.getByText('30D')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('highlights selected period with accent color', () => {
    render(<PeriodSelector selected="7d" onSelect={vi.fn()} />);
    const selectedBtn = screen.getByText('7D');
    expect(selectedBtn.className).toContain('bg-pd3/10');
    expect(selectedBtn.className).toContain('text-pd3');
  });

  it('does not highlight non-selected periods', () => {
    render(<PeriodSelector selected="7d" onSelect={vi.fn()} />);
    const otherBtn = screen.getByText('24H');
    expect(otherBtn.className).toContain('text-theme-text-muted');
    expect(otherBtn.className).not.toContain('bg-pd3/10');
  });

  it('calls onSelect with correct period when clicked', () => {
    const onSelect = vi.fn();
    render(<PeriodSelector selected="7d" onSelect={onSelect} />);

    fireEvent.click(screen.getByText('24H'));
    expect(onSelect).toHaveBeenCalledWith('24h');

    fireEvent.click(screen.getByText('30D'));
    expect(onSelect).toHaveBeenCalledWith('30d');

    fireEvent.click(screen.getByText('All'));
    expect(onSelect).toHaveBeenCalledWith('all');
  });

  it('calls onSelect even when clicking already-selected period', () => {
    const onSelect = vi.fn();
    render(<PeriodSelector selected="30d" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('30D'));
    expect(onSelect).toHaveBeenCalledWith('30d');
  });

  it.each(['24h', '7d', '30d', 'all'] as Period[])(
    'correctly highlights %s when selected',
    (period) => {
      render(<PeriodSelector selected={period} onSelect={vi.fn()} />);
      const labels: Record<Period, string> = { '24h': '24H', '7d': '7D', '30d': '30D', 'all': 'All' };
      const btn = screen.getByText(labels[period]);
      expect(btn.className).toContain('bg-pd3/10');
    },
  );
});
