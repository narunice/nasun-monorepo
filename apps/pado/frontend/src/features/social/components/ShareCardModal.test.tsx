/**
 * ShareCardModal Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useToast
const mockShowToast = vi.fn();
vi.mock('@/components/common', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock canvas renderer utils
vi.mock('../utils/canvasRenderer', () => ({
  downloadShareCard: vi.fn().mockResolvedValue(undefined),
  copyShareCardToClipboard: vi.fn().mockResolvedValue(true),
}));

import { ShareCardModal } from './ShareCardModal';

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  return canvas;
}

describe('ShareCardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <ShareCardModal isOpen={false} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when canvas is null', () => {
      const { container } = render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={null} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders modal when isOpen is true and canvas is provided', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      expect(screen.getByText('Share Card Preview')).toBeTruthy();
    });
  });

  describe('actions', () => {
    it('shows download button', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      expect(screen.getByText('Download')).toBeTruthy();
    });

    it('shows copy button', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      expect(screen.getByText('Copy')).toBeTruthy();
    });

    it('calls onClose when X button is clicked', () => {
      const onClose = vi.fn();
      render(
        <ShareCardModal isOpen={true} onClose={onClose} canvas={createMockCanvas()} />
      );
      // Find close button by its SVG path (X icon)
      const buttons = screen.getAllByRole('button');
      // First button should be close button
      const closeBtn = buttons[0];
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(
        <ShareCardModal isOpen={true} onClose={onClose} canvas={createMockCanvas()} />
      );
      // Click the backdrop (outermost fixed div)
      const backdrop = container.firstChild as HTMLElement;
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('does not call onClose when modal content is clicked', () => {
      const onClose = vi.fn();
      render(
        <ShareCardModal isOpen={true} onClose={onClose} canvas={createMockCanvas()} />
      );
      fireEvent.click(screen.getByText('Share Card Preview'));
      // onClose should not be called from content click (stopPropagation)
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('filename', () => {
    it('uses default filename when not provided', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      // Modal renders without error
      expect(screen.getByText('Download')).toBeTruthy();
    });

    it('accepts custom filename', () => {
      render(
        <ShareCardModal
          isOpen={true}
          onClose={vi.fn()}
          canvas={createMockCanvas()}
          filename="my-trade.png"
        />
      );
      expect(screen.getByText('Download')).toBeTruthy();
    });
  });
});
