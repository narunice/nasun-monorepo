/**
 * BadgeDisplay Component Tests
 * Tests rendering in both compact and full modes.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeDisplay } from './BadgeDisplay';
import type { EarnedBadge } from '../lib/badges';

// ========================================
// Test Helpers
// ========================================

function makeBadge(overrides: Partial<EarnedBadge['badge']> = {}): EarnedBadge {
  return {
    badge: {
      id: 'test-badge',
      name: 'Test Badge',
      description: 'A test badge',
      tier: 'bronze',
      category: 'volume',
      ...overrides,
    },
  };
}

// ========================================
// Rendering
// ========================================

describe('BadgeDisplay — rendering', () => {
  it('renders nothing for empty badges', () => {
    const { container } = render(<BadgeDisplay badges={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for empty badges in compact mode', () => {
    const { container } = render(<BadgeDisplay badges={[]} compact />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a single badge', () => {
    const badges = [makeBadge({ name: 'Paper Trader' })];
    render(<BadgeDisplay badges={badges} />);
    expect(screen.getByText('Paper Trader')).toBeInTheDocument();
  });

  it('renders multiple badges', () => {
    const badges = [
      makeBadge({ id: 'b1', name: 'Paper Trader', tier: 'bronze' }),
      makeBadge({ id: 'b2', name: 'Serious Trader', tier: 'silver' }),
      makeBadge({ id: 'b3', name: 'Whale', tier: 'gold' }),
    ];
    render(<BadgeDisplay badges={badges} />);
    expect(screen.getByText('Paper Trader')).toBeInTheDocument();
    expect(screen.getByText('Serious Trader')).toBeInTheDocument();
    expect(screen.getByText('Whale')).toBeInTheDocument();
  });

  it('shows badge description in title attribute', () => {
    const badges = [makeBadge({ name: 'Whale', description: 'Traded $100K+ total volume' })];
    render(<BadgeDisplay badges={badges} />);
    const badge = screen.getByText('Whale').closest('span');
    expect(badge).toHaveAttribute('title', 'Traded $100K+ total volume');
  });
});

// ========================================
// Compact Mode
// ========================================

describe('BadgeDisplay — compact mode', () => {
  it('limits to 2 badges in compact mode', () => {
    const badges = [
      makeBadge({ id: 'b1', name: 'Badge One' }),
      makeBadge({ id: 'b2', name: 'Badge Two' }),
      makeBadge({ id: 'b3', name: 'Badge Three' }),
    ];
    render(<BadgeDisplay badges={badges} compact />);
    expect(screen.getByText('Badge One')).toBeInTheDocument();
    expect(screen.getByText('Badge Two')).toBeInTheDocument();
    expect(screen.queryByText('Badge Three')).not.toBeInTheDocument();
  });

  it('shows single badge in compact mode', () => {
    const badges = [makeBadge({ name: 'Solo Badge' })];
    render(<BadgeDisplay badges={badges} compact />);
    expect(screen.getByText('Solo Badge')).toBeInTheDocument();
  });

  it('compact mode includes both name and description in title', () => {
    const badges = [makeBadge({ name: 'Whale', description: 'Traded $100K+' })];
    render(<BadgeDisplay badges={badges} compact />);
    const badge = screen.getByText('Whale').closest('span');
    expect(badge?.getAttribute('title')).toContain('Whale');
    expect(badge?.getAttribute('title')).toContain('Traded $100K+');
  });
});

// ========================================
// Full Mode (default)
// ========================================

describe('BadgeDisplay — full mode', () => {
  it('shows all badges in full mode', () => {
    const badges = Array.from({ length: 8 }, (_, i) =>
      makeBadge({ id: `b${i}`, name: `Badge ${i}` })
    );
    render(<BadgeDisplay badges={badges} />);
    for (let i = 0; i < 8; i++) {
      expect(screen.getByText(`Badge ${i}`)).toBeInTheDocument();
    }
  });
});

// ========================================
// Tier Styling
// ========================================

describe('BadgeDisplay — tier styling', () => {
  it('bronze badge has amber styling', () => {
    const badges = [makeBadge({ name: 'Bronze', tier: 'bronze' })];
    const { container } = render(<BadgeDisplay badges={badges} />);
    const badge = container.querySelector('span[title]');
    expect(badge?.className).toContain('text-amber-500');
  });

  it('silver badge has gray styling', () => {
    const badges = [makeBadge({ name: 'Silver', tier: 'silver' })];
    const { container } = render(<BadgeDisplay badges={badges} />);
    const badge = container.querySelector('span[title]');
    expect(badge?.className).toContain('text-gray-300');
  });

  it('gold badge has yellow styling', () => {
    const badges = [makeBadge({ name: 'Gold', tier: 'gold' })];
    const { container } = render(<BadgeDisplay badges={badges} />);
    const badge = container.querySelector('span[title]');
    expect(badge?.className).toContain('text-yellow-400');
  });
});
