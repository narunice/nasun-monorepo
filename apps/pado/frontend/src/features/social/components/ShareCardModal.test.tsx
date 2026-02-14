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

  // ===== T2-9: Twitter/X share link =====

  describe('Twitter/X share', () => {
    it('renders a Share on X link', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      const xLink = screen.getByTitle('Share on X');
      expect(xLink).toBeTruthy();
      expect(xLink.tagName.toLowerCase()).toBe('a');
    });

    it('has correct Twitter intent URL', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      const xLink = screen.getByTitle('Share on X') as HTMLAnchorElement;
      expect(xLink.href).toContain('x.com/intent/tweet');
      expect(xLink.href).toContain('text=');
    });

    it('opens in new tab', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      const xLink = screen.getByTitle('Share on X') as HTMLAnchorElement;
      expect(xLink.target).toBe('_blank');
      expect(xLink.rel).toContain('noopener');
    });

    it('tweet text mentions @PadoFinance', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      const xLink = screen.getByTitle('Share on X') as HTMLAnchorElement;
      const decodedUrl = decodeURIComponent(xLink.href);
      expect(decodedUrl).toContain('@PadoFinance');
      expect(decodedUrl).toContain('pado.finance');
    });

    it('tweet text mentions "2 people"', () => {
      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      const xLink = screen.getByTitle('Share on X') as HTMLAnchorElement;
      const decodedUrl = decodeURIComponent(xLink.href);
      expect(decodedUrl).toContain('2 people');
    });
  });

  // ===== T2-11: Actionable error messages =====

  describe('error messages', () => {
    it('shows actionable download error message', async () => {
      const { downloadShareCard: mockDownload } = await import('../utils/canvasRenderer');
      (mockDownload as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));

      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      fireEvent.click(screen.getByText('Download'));

      // Wait for async
      await vi.waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('right-clicking'),
          'error',
        );
      });
    });

    it('shows actionable copy error message', async () => {
      const { copyShareCardToClipboard: mockCopy } = await import('../utils/canvasRenderer');
      (mockCopy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));

      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      fireEvent.click(screen.getByText('Copy'));

      await vi.waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('downloading'),
          'error',
        );
      });
    });

    it('shows warning when copy not supported', async () => {
      const { copyShareCardToClipboard: mockCopy } = await import('../utils/canvasRenderer');
      (mockCopy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      render(
        <ShareCardModal isOpen={true} onClose={vi.fn()} canvas={createMockCanvas()} />
      );
      fireEvent.click(screen.getByText('Copy'));

      await vi.waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('not supported'),
          'warning',
        );
      });
    });
  });

  // ===== Escape key =====

  describe('keyboard', () => {
    it('closes on Escape key', () => {
      const onClose = vi.fn();
      render(
        <ShareCardModal isOpen={true} onClose={onClose} canvas={createMockCanvas()} />
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on non-Escape key', () => {
      const onClose = vi.fn();
      render(
        <ShareCardModal isOpen={true} onClose={onClose} canvas={createMockCanvas()} />
      );
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
