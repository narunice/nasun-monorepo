/**
 * RankBadge Tests
 * Tests medal display for top 3 and plain numbers for other ranks.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RankBadge } from './RankBadge';

describe('RankBadge', () => {
  describe('top 3 medals', () => {
    it('renders gold medal for rank 1', () => {
      const { container } = render(<RankBadge rank={1} />);
      const badge = container.querySelector('span')!;
      expect(badge.textContent).toBe('1st');
      expect(badge.className).toContain('text-yellow-400');
      expect(badge.className).toContain('bg-yellow-500/20');
    });

    it('renders silver medal for rank 2', () => {
      const { container } = render(<RankBadge rank={2} />);
      const badge = container.querySelector('span')!;
      expect(badge.textContent).toBe('2nd');
      expect(badge.className).toContain('text-gray-300');
      expect(badge.className).toContain('bg-gray-400/20');
    });

    it('renders bronze medal for rank 3', () => {
      const { container } = render(<RankBadge rank={3} />);
      const badge = container.querySelector('span')!;
      expect(badge.textContent).toBe('3rd');
      expect(badge.className).toContain('text-amber-500');
      expect(badge.className).toContain('bg-amber-600/20');
    });

    it('medal badges have border styling', () => {
      const { container } = render(<RankBadge rank={1} />);
      const badge = container.querySelector('span')!;
      expect(badge.className).toContain('border');
      expect(badge.className).toContain('font-bold');
    });
  });

  describe('regular ranks', () => {
    it('renders plain number for rank 4', () => {
      const { container } = render(<RankBadge rank={4} />);
      const badge = container.querySelector('span')!;
      expect(badge.textContent).toBe('4');
      expect(badge.className).toContain('text-theme-text-muted');
      expect(badge.className).not.toContain('border');
    });

    it('renders plain number for rank 50', () => {
      const { container } = render(<RankBadge rank={50} />);
      expect(container.textContent).toBe('50');
    });

    it('renders plain number for rank 100', () => {
      const { container } = render(<RankBadge rank={100} />);
      expect(container.textContent).toBe('100');
    });
  });

  describe('edge cases', () => {
    it('renders rank 0', () => {
      const { container } = render(<RankBadge rank={0} />);
      expect(container.textContent).toBe('0');
      expect(container.querySelector('span')!.className).toContain('text-theme-text-muted');
    });

    it('renders negative rank gracefully', () => {
      const { container } = render(<RankBadge rank={-1} />);
      expect(container.textContent).toBe('-1');
    });

    it('renders very large rank number', () => {
      const { container } = render(<RankBadge rank={9999} />);
      expect(container.textContent).toBe('9999');
    });
  });
});
