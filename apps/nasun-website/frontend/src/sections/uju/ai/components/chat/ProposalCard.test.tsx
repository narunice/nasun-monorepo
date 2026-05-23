/**
 * ProposalCard tests — countdown ticking, expired-state disable, deep-link
 * resolution (server-provided vs fallback).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ProposalCard } from './ProposalCard';
import type { WakeProposal } from '../../types/chat';

function baseProposal(overrides: Partial<WakeProposal> = {}): WakeProposal {
  return {
    proposal_id: '01HWGAH7XJW7CCNMPVQAB8YN3K',
    intent_id: '01HWGAH7XJW7CCNMPVQAB8YN3L',
    action_type: 'spot.buy.v1',
    summary: 'Buy 0.05 NBTC at market.',
    side: 'BUY',
    symbol: 'NBTC',
    size_quote_raw: '5000000',
    max_slippage_bps: 50,
    confidence: 0.78,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProposalCard countdown', () => {
  it('renders side badge + symbol + summary', () => {
    render(<ProposalCard proposal={baseProposal()} />);
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('NBTC')).toBeInTheDocument();
    expect(screen.getByText(/Buy 0\.05 NBTC at market/)).toBeInTheDocument();
  });

  it('updates the countdown each second', () => {
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T12:01:30Z').toISOString(),
    });
    render(<ProposalCard proposal={proposal} />);
    expect(screen.getByText(/1m 30s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText(/1m 29s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(/0m 59s/)).toBeInTheDocument();
  });

  it('switches to "Expired" once expires_at passes', () => {
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T12:00:05Z').toISOString(),
    });
    render(<ProposalCard proposal={proposal} />);
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });
});

describe('ProposalCard deep link', () => {
  it('uses tgDeepLink when server supplied a valid t.me URL', () => {
    const p = baseProposal({ tgDeepLink: 'https://t.me/nasun_ai_bot?confirm=abc' });
    render(<ProposalCard proposal={p} />);
    const link = screen.getByText('Open in Telegram').closest('a');
    expect(link?.getAttribute('href')).toBe('https://t.me/nasun_ai_bot?confirm=abc');
  });

  it('rejects non-t.me deep links and falls back', () => {
    const p = baseProposal({ tgDeepLink: 'https://evil.example.com/phish?x=1' });
    render(<ProposalCard proposal={p} />);
    const link = screen.getByText('Open in Telegram').closest('a');
    expect(link?.getAttribute('href')).toContain('https://t.me/nasun_ai_bot');
    expect(link?.getAttribute('href')).not.toContain('evil.example.com');
  });

  it('falls back to bot URL + proposal_id when tgDeepLink absent', () => {
    render(<ProposalCard proposal={baseProposal()} />);
    const link = screen.getByText('Open in Telegram').closest('a');
    expect(link?.getAttribute('href')).toBe(
      'https://t.me/nasun_ai_bot?start=proposal_01HWGAH7XJW7CCNMPVQAB8YN3K',
    );
  });
});

describe('ProposalCard expired CTA', () => {
  it('disables the link when expired', () => {
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T11:59:00Z').toISOString(),
    });
    render(<ProposalCard proposal={proposal} />);
    const link = screen.getByText('Open in Telegram').closest('a')!;
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.className).toMatch(/cursor-not-allowed/);
  });

  it('preventDefault on click when expired', () => {
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T11:59:00Z').toISOString(),
    });
    render(<ProposalCard proposal={proposal} />);
    const link = screen.getByText('Open in Telegram').closest('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const prevented = !link.dispatchEvent(event);
    expect(prevented).toBe(true);
  });
});

describe('ProposalCard side variants', () => {
  it('renders SELL with rose styling', () => {
    render(<ProposalCard proposal={baseProposal({ side: 'SELL' })} />);
    const badge = screen.getByText('SELL');
    expect(badge.className).toMatch(/rose/);
  });
});
