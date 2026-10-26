import { createRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { NSI_MAX_SCORE } from '@nasun/standing';

import { StandingPill } from '../badges/StandingPill';
import { useNasunStanding } from '../hooks/useNasunStanding';

describe('StandingPill', () => {
  it('shows the score next to the tier, rounded', () => {
    render(<StandingPill tier={2} nsiScore={412.4} nextThreshold={500} />);
    const pill = screen.getByTestId('standing-pill');
    expect(pill).toHaveTextContent('Tier 2');
    expect(pill).toHaveTextContent('412');
  });

  it('puts the distance to the next tier in the tooltip', () => {
    // The reason the score is shown at all: 95% of wallets are tier 1, so the
    // remainder is the only part that tells them anything.
    render(<StandingPill tier={1} nsiScore={412} nextThreshold={500} />);
    const title = screen.getByTestId('standing-pill').getAttribute('title') ?? '';
    expect(title).toContain('Next tier at 500 (+88)');
    expect(title).toContain(`Score 412 / ${NSI_MAX_SCORE}`);
  });

  it('omits the next-tier line at the top tier', () => {
    render(<StandingPill tier={3} nsiScore={900} nextThreshold={null} />);
    const title = screen.getByTestId('standing-pill').getAttribute('title') ?? '';
    expect(title).not.toContain('Next tier');
  });

  it('drops its own tooltip when the host renders one', () => {
    render(<StandingPill tier={1} nsiScore={10} nativeTitle={false} />);
    expect(screen.getByTestId('standing-pill')).not.toHaveAttribute('title');
  });

  it('forwards a ref and host props, which Radix asChild needs', () => {
    // Without forwardRef a Tooltip.Trigger asChild wrapper silently loses the
    // ref and the tooltip cannot position itself.
    const ref = createRef<HTMLSpanElement>();
    render(
      <StandingPill ref={ref} tier={2} nsiScore={500} data-testid="host-id" />,
    );
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(screen.getByTestId('host-id')).toHaveTextContent('Tier 2');
  });

  it('keeps a distinct tone per tier', () => {
    const { rerender } = render(<StandingPill tier={1} nsiScore={1} />);
    const tone1 = screen.getByTestId('standing-pill').className;
    rerender(<StandingPill tier={3} nsiScore={900} />);
    const tone3 = screen.getByTestId('standing-pill').className;
    expect(tone1).not.toEqual(tone3);
  });
});

describe('useNasunStanding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown, ok = true) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('reads the by-address route and maps the response', async () => {
    const fetchMock = stubFetch({
      tier: 2,
      nsi_score: 412,
      next_threshold: 500,
      has_gp: true,
      benefits: { pado_fee_discount_bps: 1000 },
    });

    const { result } = renderHook(() =>
      useNasunStanding('0xabc', 'https://explorer.nasun.io/api/v1'),
    );

    await waitFor(() => expect(result.current.standing).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      'https://explorer.nasun.io/api/v1/standing/by-address/0xabc',
    );
    expect(result.current.standing).toMatchObject({
      tier: 2,
      nsiScore: 412,
      nextThreshold: 500,
      hasGp: true,
    });
  });

  it('trims a trailing slash on the base so the path is not doubled', async () => {
    const fetchMock = stubFetch({ tier: 1, nsi_score: 0, next_threshold: 500 });
    renderHook(() => useNasunStanding('0xabc', 'https://x/api/v1/'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('https://x/api/v1/standing/by-address/0xabc');
  });

  it('refuses a tier outside 1..3 rather than rendering an undefined tone', async () => {
    stubFetch({ tier: 9, nsi_score: 100 });
    const { result } = renderHook(() => useNasunStanding('0xabc', 'https://x'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.standing).toBeNull();
  });

  it('stays null on a non-ok response', async () => {
    stubFetch({ tier: 2 }, false);
    const { result } = renderHook(() => useNasunStanding('0xabc', 'https://x'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.standing).toBeNull();
  });

  it('does not fetch without a wallet or a base url', () => {
    const fetchMock = stubFetch({ tier: 1 });
    renderHook(() => useNasunStanding(null, 'https://x'));
    renderHook(() => useNasunStanding('0xabc', ''));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
