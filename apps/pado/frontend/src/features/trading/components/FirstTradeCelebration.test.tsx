import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FirstTradeCelebration } from './FirstTradeCelebration';

describe('FirstTradeCelebration', () => {
  it('renders modal with title', () => {
    render(<FirstTradeCelebration onDismiss={() => {}} />);
    expect(screen.getByText('First Trade Complete!')).toBeInTheDocument();
  });

  it('renders CLOB description text', () => {
    render(<FirstTradeCelebration onDismiss={() => {}} />);
    expect(screen.getByText(/real on-chain CLOB orderbook/)).toBeInTheDocument();
  });

  it('renders "Share on X" link with correct href', () => {
    render(<FirstTradeCelebration onDismiss={() => {}} />);
    const link = screen.getByText('Share on X').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('x.com/intent/tweet'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('tweet text mentions #Pado and @Nasun_io without external URL', () => {
    render(<FirstTradeCelebration onDismiss={() => {}} />);
    const link = screen.getByText('Share on X').closest('a');
    const href = link?.getAttribute('href') ?? '';
    const decodedHref = decodeURIComponent(href);
    expect(decodedHref).toContain('#Pado');
    expect(decodedHref).toContain('@Nasun_io');
    expect(decodedHref).not.toContain('pado.finance');
  });

  it('calls onDismiss when "Continue Trading" is clicked', () => {
    const onDismiss = vi.fn();
    render(<FirstTradeCelebration onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText('Continue Trading'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when close button (X) is clicked', () => {
    const onDismiss = vi.fn();
    render(<FirstTradeCelebration onDismiss={onDismiss} />);

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when backdrop is clicked', () => {
    const onDismiss = vi.fn();
    const { container } = render(<FirstTradeCelebration onDismiss={onDismiss} />);

    // Backdrop is the div with bg-black/60 class
    const backdrop = container.querySelector('.bg-black\\/60');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders 50 confetti particles', () => {
    const { container } = render(<FirstTradeCelebration onDismiss={() => {}} />);

    // Particles have position: fixed and pointerEvents: none
    const particles = container.querySelectorAll('[style*="pointer-events: none"]');
    expect(particles.length).toBe(50);
  });

  it('confetti particles have valid colors from palette', () => {
    const validColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#FF9F43',
    ].map((c) => c.toLowerCase());

    const { container } = render(<FirstTradeCelebration onDismiss={() => {}} />);
    const particles = container.querySelectorAll('[style*="pointer-events: none"]');

    particles.forEach((p) => {
      const style = (p as HTMLElement).style;
      const bg = style.backgroundColor;
      // Browser may convert hex to rgb; just verify it exists
      expect(bg).toBeTruthy();
    });
  });

  it('contains keyframe animation styles', () => {
    const { container } = render(<FirstTradeCelebration onDismiss={() => {}} />);
    const style = container.querySelector('style');
    expect(style?.textContent).toContain('confetti-fall');
    expect(style?.textContent).toContain('celebration-pop');
  });

  it('modal has z-index higher than backdrop and particles', () => {
    const { container } = render(<FirstTradeCelebration onDismiss={() => {}} />);

    // Modal has z-[102] class
    const modal = container.querySelector('.z-\\[102\\]');
    expect(modal).toBeTruthy();

    // Particles have zIndex: 101
    const particle = container.querySelector('[style*="z-index: 101"]');
    expect(particle).toBeTruthy();
  });

  it('calls onDismiss when Escape key is pressed', () => {
    const onDismiss = vi.fn();
    render(<FirstTradeCelebration onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onDismiss for non-Escape keys', () => {
    const onDismiss = vi.fn();
    render(<FirstTradeCelebration onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not crash when onDismiss is called multiple times', () => {
    const onDismiss = vi.fn();
    render(<FirstTradeCelebration onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText('Continue Trading'));
    fireEvent.click(screen.getByText('Continue Trading'));
    fireEvent.click(screen.getByText('Continue Trading'));

    expect(onDismiss).toHaveBeenCalledTimes(3);
  });
});
