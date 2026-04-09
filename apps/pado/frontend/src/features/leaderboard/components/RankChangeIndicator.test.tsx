/**
 * RankChangeIndicator Tests
 * Tests positive (green up arrow), negative (red down arrow), and zero (dash) states.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RankChangeIndicator } from './RankChangeIndicator';

describe('RankChangeIndicator', () => {
  describe('positive change', () => {
    it('shows green text with up arrow and number', () => {
      const { container } = render(<RankChangeIndicator change={5} />);
      const span = container.querySelector('.text-green-400')!;
      expect(span).toBeTruthy();
      expect(span.textContent).toContain('5');
    });

    it('shows SVG arrow for positive change', () => {
      const { container } = render(<RankChangeIndicator change={3} />);
      const svg = container.querySelector('svg')!;
      expect(svg).toBeTruthy();
      // Up arrow path: "M6 2L10 8H2L6 2Z" (pointing up)
      const path = svg.querySelector('path')!;
      expect(path.getAttribute('d')).toBe('M6 2L10 8H2L6 2Z');
    });

    it('shows change of 1', () => {
      const { container } = render(<RankChangeIndicator change={1} />);
      expect(container.textContent).toContain('1');
      expect(container.querySelector('.text-green-400')).toBeTruthy();
    });

    it('shows large positive change', () => {
      const { container } = render(<RankChangeIndicator change={99} />);
      expect(container.textContent).toContain('99');
    });
  });

  describe('negative change', () => {
    it('shows red text with down arrow and absolute number', () => {
      const { container } = render(<RankChangeIndicator change={-3} />);
      const span = container.querySelector('.text-red-400')!;
      expect(span).toBeTruthy();
      expect(span.textContent).toContain('3'); // absolute value
      expect(span.textContent).not.toContain('-3');
    });

    it('shows SVG arrow for negative change', () => {
      const { container } = render(<RankChangeIndicator change={-2} />);
      const svg = container.querySelector('svg')!;
      const path = svg.querySelector('path')!;
      // Down arrow path: "M6 10L2 4H10L6 10Z" (pointing down)
      expect(path.getAttribute('d')).toBe('M6 10L2 4H10L6 10Z');
    });

    it('shows change of -1', () => {
      const { container } = render(<RankChangeIndicator change={-1} />);
      expect(container.textContent).toContain('1');
      expect(container.querySelector('.text-red-400')).toBeTruthy();
    });

    it('shows large negative change', () => {
      const { container } = render(<RankChangeIndicator change={-50} />);
      expect(container.textContent).toContain('50');
    });
  });

  describe('zero change', () => {
    it('shows dash with muted styling', () => {
      const { container } = render(<RankChangeIndicator change={0} />);
      const span = container.querySelector('.text-theme-text-muted')!;
      expect(span).toBeTruthy();
      expect(span.textContent).toBe('-');
    });

    it('does not show SVG arrow', () => {
      const { container } = render(<RankChangeIndicator change={0} />);
      expect(container.querySelector('svg')).toBeNull();
    });

    it('does not show green or red coloring', () => {
      const { container } = render(<RankChangeIndicator change={0} />);
      expect(container.querySelector('.text-green-400')).toBeNull();
      expect(container.querySelector('.text-red-400')).toBeNull();
    });
  });
});
