import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenesisPassBadge } from '../badges/GenesisPassBadge';

describe('GenesisPassBadge', () => {
  it('renders compact variant with "GP" text by default', () => {
    render(<GenesisPassBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge).toHaveTextContent('GP');
    expect(badge).not.toHaveTextContent('Genesis Pass');
  });

  it('renders full variant with "Genesis Pass" text', () => {
    render(<GenesisPassBadge variant="full" />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge).toHaveTextContent('Genesis Pass');
  });

  it('renders crown SVG icon', () => {
    render(<GenesisPassBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    const svg = badge.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('applies teal styling classes', () => {
    render(<GenesisPassBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge.className).toContain('bg-teal-500/15');
    expect(badge.className).toContain('text-teal-400');
    expect(badge.className).toContain('border-teal-500/30');
  });

  it('applies amber color to crown icon', () => {
    render(<GenesisPassBadge />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    const svg = badge.querySelector('svg');
    expect(svg?.className.baseVal || svg?.getAttribute('class')).toContain('text-amber-400');
  });

  it('accepts and applies className prop', () => {
    render(<GenesisPassBadge className="custom-class" />);
    const badge = screen.getByTitle('Genesis Pass Holder');
    expect(badge.className).toContain('custom-class');
  });
});
