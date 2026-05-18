/**
 * shareUrl — Share Button helpers for replay rounds.
 *
 * Tier 0.5 v0.5 scope (review-locked):
 *   - Static OG + replay URL only; no dynamic image generation.
 *   - No `?ref` attach (deferred until nasun referral code exposure path lands).
 *   - Single message template; big-win variants and lose-hide branching are
 *     deferred per review notes (N1/N2).
 *
 * Share URLs are derived from server-validated RoundDetail.session_id, NOT
 * from `window.location.href` — this avoids referral-credit spoofing where
 * a user shares another player's round under their own attribution
 * (review C1).
 */

import type { GameKey, RoundCore } from '../../lib/api/types';
import { fmtUsdc, multiplierBpsToX } from '../dashboard/format';

const PRODUCTION_ORIGIN = 'https://gostop.app';

/**
 * Site origin used to compose shareable URLs.
 *
 * In browser contexts we use the current origin so dev/staging/preview hosts
 * produce links that work when opened locally. Outside the browser (SSR, unit
 * tests) we fall back to the production origin so snapshot tests are stable.
 */
function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return PRODUCTION_ORIGIN;
}

/**
 * Replay URL for a lottery round.
 *
 * `sessionIdHex` may or may not carry a leading `0x` — we normalize once here.
 * ReplayPage accepts either form but cache splits on the literal string, so
 * sharing the canonical form keeps things consistent.
 */
export function buildLotteryReplayUrl(sessionIdHex: string): string {
  const lower = sessionIdHex.toLowerCase();
  const normalized = lower.startsWith('0x') ? lower : `0x${lower}`;
  return `${siteOrigin()}/replay/lottery/${normalized}`;
}

/**
 * Shareable URL for an arbitrary round.
 *
 * lottery rounds have a public ReplayPage at `/replay/lottery/:sessionId`, so
 * we deep-link there. Other games (scratchcard/numbermatch/mines/wheel/crash)
 * have no public replay page yet — Tier 1 backlog — so we share the gostop
 * homepage instead. The round-specific verification link (chain explorer tx)
 * goes into the message body so anyone can verify the result onchain.
 *
 * Twitter/X surfaces the OG card of the `url=` param specifically; sending
 * the gostop homepage there guarantees the gostop OG card renders even when
 * the underlying round only has a chain-explorer record.
 */
export function buildShareUrlForGame(game: GameKey, sessionIdHex: string): string {
  if (game === 'lottery') return buildLotteryReplayUrl(sessionIdHex);
  return `${siteOrigin()}/`;
}

/**
 * Default share message for a win round.
 *
 * Single celebratory line for every game. Onchain verification is exposed
 * separately via the modal's explorer link, so the tweet body stays clean
 * and focused on the brag.
 *
 * Twitter/Telegram intents URL-encode this via encodeURIComponent at the call
 * site, so embed-special characters (`&`, `?`, `#`, newlines) are handled
 * there.
 */
export function buildShareMessage(round: RoundCore, _game?: GameKey): string {
  const payout = fmtUsdc(round.payout);
  const mult = multiplierBpsToX(round.multiplier_bps);
  return `🎰✨ Just hit ${mult} for ${payout} NUSDC on gostop.app 🍀💰`;
}

/**
 * Whether the round should expose share buttons for the viewing user.
 *
 * Win is decided by `payout > bet_amount` rather than `status === 'won'`
 * because each game uses a different status string (lottery uses
 * `won`/`lost`/`pending`, while numbermatch/mines/wheel use `final` regardless
 * of outcome). Net-profit comparison works uniformly across games and
 * naturally excludes pending rounds (payout defaults to 0 until settlement).
 *
 * Anonymous rounds cannot be matched to the current user — the masked player
 * string is `anon_<hash>`, never the wallet — so we treat them as not-owned.
 *
 * Caller must pass the current user's wallet (from useGostopAuth). When
 * undefined (logged out), Share Button is not shown.
 */
export function canShareRound(
  round: RoundCore,
  viewerWallet: string | undefined,
): boolean {
  if (!viewerWallet) return false;
  if (round.anonymous) return false;
  if (round.player !== viewerWallet) return false;
  let payout: bigint;
  let bet: bigint;
  try {
    payout = BigInt(round.payout);
    bet = BigInt(round.bet_amount);
  } catch {
    return false;
  }
  return payout > bet;
}
