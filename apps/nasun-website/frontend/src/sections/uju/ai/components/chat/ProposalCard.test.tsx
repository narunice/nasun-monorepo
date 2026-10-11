/**
 * ProposalCard tests: countdown ticking, and the Confirm / Cancel contract.
 *
 * The card used to offer only "Open in Telegram", pointing at a link that
 * could never work (/start reads its payload as a session sid, so
 * proposal_<id> came back as "link already used"). What matters now is that
 * the buttons appear exactly when the proposal can still be answered, and
 * never once it is expired or settled.
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

describe('ProposalCard actions', () => {
  it('offers Confirm and Cancel while the proposal is live', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ProposalCard proposal={baseProposal()} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    screen.getByRole('button', { name: 'Confirm' }).click();
    screen.getByRole('button', { name: 'Cancel' }).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Open in Telegram')).not.toBeInTheDocument();
  });

  it('renders read-only when no handlers are supplied', () => {
    // History replay: the card is a record of what was agreed, not a control.
    render(<ProposalCard proposal={baseProposal()} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('disables both buttons while an answer is in flight', () => {
    render(
      <ProposalCard
        proposal={baseProposal()}
        status="submitting"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it.each([
    ['confirmed', 'Confirmed. Submitting to the chain.'],
    ['cancelled', 'Cancelled. Your agent is free to trade again.'],
    ['resolved', 'Already answered.'],
  ] as const)('replaces the buttons once %s', (status, label) => {
    render(
      <ProposalCard
        proposal={baseProposal()}
        status={status}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('offers no action once expired', () => {
    // The server re-checks expiry on every answer, so this is about not
    // inviting a click that is guaranteed to fail.
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T11:59:00Z').toISOString(),
    });
    render(
      <ProposalCard proposal={proposal} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.getByText(/expired before it was answered/)).toBeInTheDocument();
  });

  it('keeps the in-flight state when the countdown lapses mid-answer', () => {
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T11:59:00Z').toISOString(),
    });
    render(
      <ProposalCard
        proposal={proposal}
        status="submitting"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // The confirm may already have been accepted; saying "expired before it
    // was answered" would state the opposite of what happened.
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeInTheDocument();
    expect(screen.queryByText(/expired before it was answered/)).not.toBeInTheDocument();
  });

  it('stops offering Confirm the moment the countdown runs out', () => {
    const proposal = baseProposal({
      expires_at: new Date('2026-05-22T12:00:30Z').toISOString(),
    });
    render(
      <ProposalCard proposal={proposal} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });
});

describe('ProposalCard side variants', () => {
  it('renders SELL with rose styling', () => {
    render(<ProposalCard proposal={baseProposal({ side: 'SELL' })} />);
    const badge = screen.getByText('SELL');
    expect(badge.className).toMatch(/rose/);
  });
});
