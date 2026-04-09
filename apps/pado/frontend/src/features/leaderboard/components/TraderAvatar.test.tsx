/**
 * TraderAvatar Tests
 * Tests deterministic SVG avatar generation from wallet address.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TraderAvatar } from './TraderAvatar';

const ADDR_A = '0x' + 'aa'.repeat(32);
const ADDR_B = '0x' + 'bb'.repeat(32);

describe('TraderAvatar', () => {
  describe('rendering', () => {
    it('renders an SVG element', () => {
      const { container } = render(<TraderAvatar address={ADDR_A} />);
      const svg = container.querySelector('svg')!;
      expect(svg).toBeTruthy();
      expect(svg.tagName).toBe('svg');
    });

    it('uses default size of 40', () => {
      const { container } = render(<TraderAvatar address={ADDR_A} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('width')).toBe('40');
      expect(svg.getAttribute('height')).toBe('40');
    });

    it('respects custom size', () => {
      const { container } = render(<TraderAvatar address={ADDR_A} size={48} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('width')).toBe('48');
      expect(svg.getAttribute('height')).toBe('48');
    });

    it('has rounded-lg class', () => {
      const { container } = render(<TraderAvatar address={ADDR_A} />);
      const svg = container.querySelector('svg')!;
      expect(svg.classList.contains('rounded-lg')).toBe(true);
    });

    it('renders background rect', () => {
      const { container } = render(<TraderAvatar address={ADDR_A} />);
      const rects = container.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThanOrEqual(1); // at least background rect
    });
  });

  describe('determinism', () => {
    it('same address produces same avatar', () => {
      const { container: c1 } = render(<TraderAvatar address={ADDR_A} />);
      const { container: c2 } = render(<TraderAvatar address={ADDR_A} />);
      expect(c1.innerHTML).toBe(c2.innerHTML);
    });

    it('different addresses produce different avatars', () => {
      const { container: c1 } = render(<TraderAvatar address={ADDR_A} />);
      const { container: c2 } = render(<TraderAvatar address={ADDR_B} />);
      expect(c1.innerHTML).not.toBe(c2.innerHTML);
    });
  });

  describe('edge cases', () => {
    it('handles short address', () => {
      const { container } = render(<TraderAvatar address="0xabcd" />);
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('handles address without 0x prefix', () => {
      const { container } = render(<TraderAvatar address={'a'.repeat(64)} />);
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('handles empty string address', () => {
      const { container } = render(<TraderAvatar address="" />);
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('grid cells are symmetric (mirrored horizontally)', () => {
      const { container } = render(<TraderAvatar address={ADDR_A} size={40} />);
      const rects = Array.from(container.querySelectorAll('rect'));
      // Skip first rect (background)
      const cellRects = rects.slice(1);

      // For each cell at (x, y), there should be a mirror at (3*cellSize - x)
      // cellSize = 40/4 = 10
      for (const rect of cellRects) {
        const x = parseFloat(rect.getAttribute('x') || '0');
        const y = parseFloat(rect.getAttribute('y') || '0');
        const cellSize = 10;
        const mirrorX = (3 * cellSize) - x;
        // If this cell is on the left half (col 0 or 1), mirror should exist
        if (x <= cellSize) {
          const hasMirror = cellRects.some(
            (r) =>
              parseFloat(r.getAttribute('x') || '0') === mirrorX &&
              parseFloat(r.getAttribute('y') || '0') === y,
          );
          expect(hasMirror).toBe(true);
        }
      }
    });
  });
});
