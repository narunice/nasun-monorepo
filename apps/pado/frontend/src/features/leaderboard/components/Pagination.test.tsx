/**
 * Pagination Tests
 * Tests page buttons, prev/next, ellipsis, edge cases.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  describe('visibility', () => {
    it('returns null when totalPages <= 1', () => {
      const { container } = render(
        <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />,
      );
      expect(container.innerHTML).toBe('');
    });

    it('returns null when totalPages is 0', () => {
      const { container } = render(
        <Pagination currentPage={1} totalPages={0} onPageChange={vi.fn()} />,
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders when totalPages > 1', () => {
      const { container } = render(
        <Pagination currentPage={1} totalPages={2} onPageChange={vi.fn()} />,
      );
      expect(container.innerHTML).not.toBe('');
    });
  });

  describe('page buttons', () => {
    it('renders page 1 and 2 for 2 pages', () => {
      render(<Pagination currentPage={1} totalPages={2} onPageChange={vi.fn()} />);
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
    });

    it('highlights current page with accent color', () => {
      render(<Pagination currentPage={2} totalPages={5} onPageChange={vi.fn()} />);
      const btn = screen.getByText('2');
      expect(btn.className).toContain('bg-pd3/10');
      expect(btn.className).toContain('text-pd3');
    });

    it('does not highlight non-current pages', () => {
      render(<Pagination currentPage={2} totalPages={5} onPageChange={vi.fn()} />);
      const btn = screen.getByText('3');
      expect(btn.className).not.toContain('bg-pd3/10');
    });

    it('calls onPageChange with correct page number', () => {
      const onPageChange = vi.fn();
      render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);
      fireEvent.click(screen.getByText('2'));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });
  });

  describe('prev/next buttons', () => {
    it('disables prev button on page 1', () => {
      const { container } = render(
        <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
      );
      const prevBtn = container.querySelectorAll('button')[0];
      expect(prevBtn.disabled).toBe(true);
    });

    it('disables next button on last page', () => {
      const { container } = render(
        <Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />,
      );
      const buttons = container.querySelectorAll('button');
      const nextBtn = buttons[buttons.length - 1];
      expect(nextBtn.disabled).toBe(true);
    });

    it('prev button navigates to previous page', () => {
      const onPageChange = vi.fn();
      const { container } = render(
        <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
      );
      fireEvent.click(container.querySelectorAll('button')[0]);
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('next button navigates to next page', () => {
      const onPageChange = vi.fn();
      const { container } = render(
        <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
      );
      const buttons = container.querySelectorAll('button');
      fireEvent.click(buttons[buttons.length - 1]);
      expect(onPageChange).toHaveBeenCalledWith(4);
    });
  });

  describe('ellipsis', () => {
    it('shows ellipsis for many pages', () => {
      render(<Pagination currentPage={5} totalPages={10} onPageChange={vi.fn()} />);
      // Should show: 1 ... 4 5 6 ... 10
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('6')).toBeTruthy();
      expect(screen.getByText('10')).toBeTruthy();
      const ellipses = screen.getAllByText('...');
      expect(ellipses.length).toBe(2);
    });

    it('no ellipsis when all pages fit', () => {
      render(<Pagination currentPage={2} totalPages={3} onPageChange={vi.fn()} />);
      expect(screen.queryByText('...')).toBeNull();
    });

    it('shows only trailing ellipsis on page 1', () => {
      render(<Pagination currentPage={1} totalPages={10} onPageChange={vi.fn()} />);
      // Should show: 1 2 ... 10
      const ellipses = screen.getAllByText('...');
      expect(ellipses.length).toBe(1);
    });

    it('shows only leading ellipsis on last page', () => {
      render(<Pagination currentPage={10} totalPages={10} onPageChange={vi.fn()} />);
      // Should show: 1 ... 9 10
      const ellipses = screen.getAllByText('...');
      expect(ellipses.length).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('always shows first and last page', () => {
      render(<Pagination currentPage={5} totalPages={10} onPageChange={vi.fn()} />);
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('10')).toBeTruthy();
    });

    it('handles 2 total pages', () => {
      render(<Pagination currentPage={1} totalPages={2} onPageChange={vi.fn()} />);
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.queryByText('...')).toBeNull();
    });

    it('handles page 2 of 10 (no leading ellipsis)', () => {
      render(<Pagination currentPage={2} totalPages={10} onPageChange={vi.fn()} />);
      // Should show: 1 2 3 ... 10
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('10')).toBeTruthy();
      const ellipses = screen.getAllByText('...');
      expect(ellipses.length).toBe(1);
    });
  });
});
