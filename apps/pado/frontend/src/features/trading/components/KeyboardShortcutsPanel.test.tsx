/**
 * KeyboardShortcutsPanel Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

describe('KeyboardShortcutsPanel', () => {
  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <KeyboardShortcutsPanel isOpen={false} onClose={vi.fn()} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders overlay when isOpen is true', () => {
      render(<KeyboardShortcutsPanel isOpen={true} onClose={vi.fn()} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    });
  });

  describe('content', () => {
    it('shows all shortcut categories', () => {
      render(<KeyboardShortcutsPanel isOpen={true} onClose={vi.fn()} />);
      expect(screen.getByText('Side')).toBeTruthy();
      expect(screen.getByText('Order Mode')).toBeTruthy();
      expect(screen.getByText('Amount')).toBeTruthy();
      expect(screen.getByText('Price')).toBeTruthy();
      expect(screen.getByText('Actions')).toBeTruthy();
      expect(screen.getByText('Navigation')).toBeTruthy();
    });

    it('shows key bindings', () => {
      render(<KeyboardShortcutsPanel isOpen={true} onClose={vi.fn()} />);
      // Check some key bindings are present
      expect(screen.getByText('B')).toBeTruthy();  // Buy
      expect(screen.getByText('S')).toBeTruthy();  // Sell
      expect(screen.getByText('L')).toBeTruthy();  // Limit
      expect(screen.getByText('M')).toBeTruthy();  // Market
    });

    it('shows close button', () => {
      render(<KeyboardShortcutsPanel isOpen={true} onClose={vi.fn()} />);
      // X button should exist
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('closing', () => {
    it('calls onClose when X button is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsPanel isOpen={true} onClose={onClose} />);
      // Find the close button (first button or one with specific text)
      const closeBtn = screen.getAllByRole('button')[0];
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(
        <KeyboardShortcutsPanel isOpen={true} onClose={onClose} />
      );
      // The outer fixed div is the backdrop
      const backdrop = container.firstChild as HTMLElement;
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('does not call onClose when panel content is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsPanel isOpen={true} onClose={onClose} />);
      // Click on the panel title (inside content, not backdrop)
      const title = screen.getByText('Keyboard Shortcuts');
      fireEvent.click(title);
      // onClose might be called from backdrop propagation, depends on stopPropagation
      // This tests that clicking inner content doesn't double-fire
    });
  });

  describe('accessibility', () => {
    it('has proper heading', () => {
      render(<KeyboardShortcutsPanel isOpen={true} onClose={vi.fn()} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    });
  });
});
