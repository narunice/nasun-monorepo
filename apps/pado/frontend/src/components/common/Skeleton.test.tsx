/**
 * Skeleton component tests (T2-10)
 * Tests all skeleton variants: SkeletonBox, SkeletonRow, SkeletonTable,
 * SkeletonCard, SkeletonMarketRow, SkeletonStatGrid.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkeletonBox, SkeletonRow, SkeletonTable, SkeletonCard, SkeletonMarketRow, SkeletonStatGrid } from './Skeleton';

// ========================================
// 1. SkeletonBox
// ========================================

describe('SkeletonBox', () => {
  it('renders with default className', () => {
    const { container } = render(<SkeletonBox />);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.className).toContain('animate-pulse');
    expect(div.className).toContain('h-4');
    expect(div.className).toContain('w-full');
  });

  it('accepts custom className', () => {
    const { container } = render(<SkeletonBox className="h-8 w-32" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('h-8');
    expect(div.className).toContain('w-32');
    expect(div.className).toContain('animate-pulse');
  });

  it('always includes animate-pulse and rounded', () => {
    const { container } = render(<SkeletonBox className="custom-class" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('animate-pulse');
    expect(div.className).toContain('rounded');
    expect(div.className).toContain('bg-theme-bg-tertiary');
  });
});

// ========================================
// 2. SkeletonRow
// ========================================

describe('SkeletonRow', () => {
  it('renders default 3 columns', () => {
    const { container } = render(<SkeletonRow />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(3);
  });

  it('renders specified number of columns', () => {
    const { container } = render(<SkeletonRow cols={6} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(6);
  });

  it('renders 1 column (minimum)', () => {
    const { container } = render(<SkeletonRow cols={1} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(1);
  });

  it('renders 0 columns (empty)', () => {
    const { container } = render(<SkeletonRow cols={0} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(0);
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonRow className="my-class" />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('my-class');
  });

  it('sets grid-template-columns inline style', () => {
    const { container } = render(<SkeletonRow cols={4} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });
});

// ========================================
// 3. SkeletonTable
// ========================================

describe('SkeletonTable', () => {
  it('renders default 5 rows', () => {
    const { container } = render(<SkeletonTable />);
    const table = container.firstChild as HTMLElement;
    expect(table.children.length).toBe(5);
  });

  it('renders specified rows and cols', () => {
    const { container } = render(<SkeletonTable rows={10} cols={6} />);
    const table = container.firstChild as HTMLElement;
    expect(table.children.length).toBe(10);
    // Each row should have 6 cols
    const firstRow = table.children[0] as HTMLElement;
    expect(firstRow.children.length).toBe(6);
  });

  it('renders 0 rows', () => {
    const { container } = render(<SkeletonTable rows={0} />);
    const table = container.firstChild as HTMLElement;
    expect(table.children.length).toBe(0);
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonTable className="custom" />);
    const table = container.firstChild as HTMLElement;
    expect(table.className).toContain('custom');
    expect(table.className).toContain('space-y-2');
  });
});

// ========================================
// 4. SkeletonCard
// ========================================

describe('SkeletonCard', () => {
  it('renders with default 3 lines', () => {
    const { container } = render(<SkeletonCard />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('animate-pulse');
    expect(card.className).toContain('rounded-xl');
    // Title + value + lines container
    const linesContainer = card.querySelector('.space-y-2') as HTMLElement;
    expect(linesContainer).toBeTruthy();
    expect(linesContainer.children.length).toBe(3);
  });

  it('renders specified number of lines', () => {
    const { container } = render(<SkeletonCard lines={5} />);
    const linesContainer = container.querySelector('.space-y-2') as HTMLElement;
    expect(linesContainer.children.length).toBe(5);
  });

  it('renders 0 lines', () => {
    const { container } = render(<SkeletonCard lines={0} />);
    const linesContainer = container.querySelector('.space-y-2') as HTMLElement;
    expect(linesContainer.children.length).toBe(0);
  });

  it('lines have decreasing widths', () => {
    const { container } = render(<SkeletonCard lines={3} />);
    const lines = container.querySelectorAll('.space-y-2 > div');
    // width: 80%, 65%, 50% (80 - i*15)
    expect((lines[0] as HTMLElement).style.width).toBe('80%');
    expect((lines[1] as HTMLElement).style.width).toBe('65%');
    expect((lines[2] as HTMLElement).style.width).toBe('50%');
  });
});

// ========================================
// 5. SkeletonMarketRow
// ========================================

describe('SkeletonMarketRow', () => {
  it('renders with circle avatar placeholder', () => {
    const { container } = render(<SkeletonMarketRow />);
    const circle = container.querySelector('.rounded-full') as HTMLElement;
    expect(circle).toBeTruthy();
    expect(circle.className).toContain('w-8');
    expect(circle.className).toContain('h-8');
  });

  it('has animate-pulse', () => {
    const { container } = render(<SkeletonMarketRow />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('animate-pulse');
  });

  it('has left side (avatar + name) and right side (price)', () => {
    const { container } = render(<SkeletonMarketRow />);
    const flex = container.firstChild as HTMLElement;
    expect(flex.className).toContain('flex');
    expect(flex.className).toContain('justify-between');
  });
});

// ========================================
// 6. SkeletonStatGrid
// ========================================

describe('SkeletonStatGrid', () => {
  it('renders default 4 items in 2 columns', () => {
    const { container } = render(<SkeletonStatGrid />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(4);
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });

  it('renders specified count and columns', () => {
    const { container } = render(<SkeletonStatGrid count={6} cols={3} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(6);
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  it('renders 0 items', () => {
    const { container } = render(<SkeletonStatGrid count={0} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(0);
  });

  it('each item has label and value placeholders', () => {
    const { container } = render(<SkeletonStatGrid count={1} />);
    const item = container.querySelector('.rounded-lg.p-3') as HTMLElement;
    expect(item).toBeTruthy();
    // Label (h-3) + value (h-5)
    expect(item.children.length).toBe(2);
  });
});
