import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenesisPassInlineBadge } from './GenesisPassInlineBadge';

describe('GenesisPassInlineBadge', () => {
  it('renders crown emoji and GP text', () => {
    render(<GenesisPassInlineBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('GP');
    expect(badge.textContent).toContain('\u{1F451}');
  });

  it('applies amber styling', () => {
    render(<GenesisPassInlineBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge.className).toContain('text-amber-400');
    expect(badge.className).toContain('bg-amber-500/15');
    expect(badge.className).toContain('border-amber-500/30');
  });

  it('renders as inline-flex rounded pill', () => {
    render(<GenesisPassInlineBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge.className).toContain('inline-flex');
    expect(badge.className).toContain('rounded-full');
  });
});
