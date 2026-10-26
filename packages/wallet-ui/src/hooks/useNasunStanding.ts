import { useEffect, useState } from 'react';
import type { Tier } from '@nasun/standing';

/**
 * The one place that reads a wallet's Nasun Standing.
 *
 * Three apps show this now (nasun.io navbar and dashboard, Pado header and
 * order modal, GoStop header and profile card), and before this hook each had
 * its own copy of the fetch: two in nasun-website that a comment described as
 * deliberately mirroring each other, and a third in Pado on react-query. Any
 * fix to the shape handling had to be made in every one of them.
 *
 * `apiBase` is a parameter rather than an env read because this package must
 * not reach for a consumer app's VITE_* names. Pass
 * `${VITE_EXPLORER_API_URL}` (nasun-website, GoStop) or
 * `NETWORK_CONFIG.explorerApi` (Pado); both already resolve to
 * `https://explorer.nasun.io/api/v1`.
 *
 * Freshness is the HTTP cache's job: the explorer-api route sends
 * `Cache-Control: public, max-age=60` with `Vary: Origin`, so the browser
 * absorbs repeat hits across route changes. This hook keeps no cache of its
 * own, on purpose.
 *
 * A failure leaves `standing` null and logs nothing. Every caller renders
 * nothing in that case, which is the right default for a badge: the API being
 * briefly unreachable is not worth an error state in a navbar. Note that the
 * public route answers with a tier-1 baseline for a wallet that has no
 * `user_nsi` row yet, so a null here means the request failed, never "new
 * user".
 */

/**
 * The benefits the public route actually puts on the wire, which is not the
 * `TierBenefits` that @nasun/standing exports. That type mirrors policy.move
 * field for field (`fee_discount_bps`, `gostop_max_bet_usdc_micro`, ...),
 * while `publicBenefits()` in routes/standing.ts renames and narrows it to
 * these three. Declaring the Move type here would let a caller read
 * `fee_discount_bps`, type-check clean, and read undefined at runtime.
 */
export interface StandingBenefitsWire {
  pado_fee_discount_bps: number;
  gostop_max_bet_usd: number;
  can_create_vault: boolean;
}

export interface NasunStanding {
  tier: Tier;
  nsiScore: number;
  /** null once the wallet is at the top tier. */
  nextThreshold: number | null;
  hasGp: boolean;
  /** Absent on responses from older deployments. */
  benefits: StandingBenefitsWire | null;
}

export interface UseNasunStandingResult {
  standing: NasunStanding | null;
  isLoading: boolean;
}

export function useNasunStanding(
  walletAddress: string | null | undefined,
  apiBase: string | null | undefined,
): UseNasunStandingResult {
  const [standing, setStanding] = useState<NasunStanding | null>(null);
  // Starts true when there is something to fetch, so a card that shows a
  // skeleton while loading does not render nothing on the first paint and then
  // flash into the skeleton.
  const [isLoading, setIsLoading] = useState(Boolean(walletAddress && apiBase));

  useEffect(() => {
    if (!walletAddress || !apiBase) {
      setStanding(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    // Clear first: on a wallet switch the previous wallet's tier must not stay
    // on screen, and a failed fetch for the new wallet returns without writing.
    setStanding(null);
    setIsLoading(true);

    (async () => {
      try {
        const res = await fetch(
          `${apiBase.replace(/\/$/, '')}/standing/by-address/${encodeURIComponent(walletAddress)}`,
        );
        if (cancelled) return;
        if (!res.ok) return;
        const json: unknown = await res.json();
        if (cancelled) return;

        const parsed = parseStanding(json);
        if (parsed) setStanding(parsed);
      } catch {
        // Silent: the caller renders nothing rather than an error state.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, apiBase]);

  return { standing, isLoading };
}

function parseBenefits(raw: unknown): StandingBenefitsWire | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  return {
    pado_fee_discount_bps: Number(b.pado_fee_discount_bps ?? 0),
    gostop_max_bet_usd: Number(b.gostop_max_bet_usd ?? 0),
    can_create_vault: Boolean(b.can_create_vault),
  };
}

function parseStanding(json: unknown): NasunStanding | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;

  // Guard the tier rather than trusting it: it indexes the style and copy
  // tables, so a stray value would render an undefined pill.
  const tier = o.tier;
  if (tier !== 1 && tier !== 2 && tier !== 3) return null;

  return {
    tier,
    nsiScore: Number(o.nsi_score ?? 0),
    nextThreshold:
      o.next_threshold === null || o.next_threshold === undefined
        ? null
        : Number(o.next_threshold),
    hasGp: Boolean(o.has_gp),
    benefits: parseBenefits(o.benefits),
  };
}
