/**
 * Game history client. Sender-based event query + per-game mappers.
 *
 * Single `queryEvents({Sender})` paginated up to 1000 events (50/page × 20).
 * Activities are categorized client-side by event type; lottery additionally
 * does a multi-get of round objects to derive win/loss deterministically.
 *
 * Crash mapping is "optimistic settling" — see mapCrash for details. Real
 * accuracy waits on the LT-3 indexer; for now the `source` field marks
 * which rows are optimistic so the future indexer can reconcile them.
 */

import type { SuiEvent, EventId } from '@mysten/sui/client'
import { getSuiClient } from '../../../lib/sui-client'
import {
  SCRATCH_PURCHASED_EVENT_TYPE,
  SCRATCH_CARD_PRICE,
  NM_PLAYED_EVENT_TYPE,
  TICKET_PURCHASED_EVENT_TYPE,
  MINES_SESSION_FINISHED_EVENT_TYPE,
  CRASH_BET_PLACED_EVENT_TYPE,
  CRASH_CASH_OUT_RECORDED_EVENT_TYPE,
} from '../../../lib/gostop-config'
import {
  countMatchingNumbers,
  getTicketTier,
  getTierPayout,
  getTierLabel,
  parseLotteryRoundFields,
  PRIZE_TIER,
  type LotteryRound,
} from '../../lottery/lottery-client'
import type {
  GameActivity,
  ActivityResult,
} from '../types'

// === Constants ===

const MAX_PAGES = 20
const PAGE_SIZE = 50

// Crash window: contract enforces FLYING ≤ 120s; production BETTING ~60s.
// 2.5 minutes covers the normal round + ~60s of additional settling so a
// just-bet user sees their row immediately as "settling…", then it promotes
// to win/loss as the next refetch lands. Stuck-round (1h refund) cases need
// the LT-3 indexer to be detected.
const CRASH_FINALIZE_WINDOW_MS = 150 * 1000
const CLOCK_SKEW_MS = 30 * 1000

// === Event-type union ===

const EVENT_TYPES = {
  scratch: SCRATCH_PURCHASED_EVENT_TYPE,
  nm: NM_PLAYED_EVENT_TYPE,
  ticket: TICKET_PURCHASED_EVENT_TYPE,
  minesFinished: MINES_SESSION_FINISHED_EVENT_TYPE,
  crashBet: CRASH_BET_PLACED_EVENT_TYPE,
  crashCash: CRASH_CASH_OUT_RECORDED_EVENT_TYPE,
}
const ALL_EVENT_TYPES = new Set(Object.values(EVENT_TYPES).filter((s) => s.length > 0))

// === Sender event fetcher ===

interface RawEvents {
  scratch: SuiEvent[]
  numbermatch: SuiEvent[]
  lottery: SuiEvent[]
  mines: SuiEvent[]
  crashBet: SuiEvent[]
  crashCash: SuiEvent[]
  isTruncated: boolean
}

async function fetchUserGameEvents(address: string): Promise<RawEvents> {
  const client = getSuiClient()
  const out: RawEvents = {
    scratch: [],
    numbermatch: [],
    lottery: [],
    mines: [],
    crashBet: [],
    crashCash: [],
    isTruncated: false,
  }
  let cursor: EventId | null = null
  let exhausted = false

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.queryEvents({
      query: { Sender: address },
      limit: PAGE_SIZE,
      order: 'descending',
      cursor: cursor ?? undefined,
    })

    for (const event of result.data) {
      if (!ALL_EVENT_TYPES.has(event.type)) continue
      if (event.type === EVENT_TYPES.scratch) out.scratch.push(event)
      else if (event.type === EVENT_TYPES.nm) out.numbermatch.push(event)
      else if (event.type === EVENT_TYPES.ticket) out.lottery.push(event)
      else if (event.type === EVENT_TYPES.minesFinished) out.mines.push(event)
      else if (event.type === EVENT_TYPES.crashBet) out.crashBet.push(event)
      else if (event.type === EVENT_TYPES.crashCash) out.crashCash.push(event)
    }

    if (!result.hasNextPage) {
      exhausted = true
      break
    }
    if (!result.nextCursor) {
      // RPC returned hasNextPage=true with no cursor; treat as truncated to
      // avoid an infinite loop replaying the same page.
      console.warn('[history] queryEvents missing nextCursor; stopping early')
      break
    }
    cursor = result.nextCursor
  }

  out.isTruncated = !exhausted
  return out
}

// === Mappers ===

function mapScratch(event: SuiEvent): GameActivity | null {
  const d = event.parsedJson as
    | { card_id?: string; multiplier?: string; prize_amount?: string }
    | undefined
  if (
    typeof d?.card_id !== 'string' ||
    typeof d?.multiplier !== 'string' ||
    typeof d?.prize_amount !== 'string'
  ) {
    console.warn('[history] malformed scratch event', event)
    return null
  }
  const multiplier = Number(d.multiplier)
  return {
    id: `scratch-${event.id.txDigest}-${event.id.eventSeq}`,
    gameType: 'scratch',
    timestampMs: Number(event.timestampMs ?? 0),
    spent: SCRATCH_CARD_PRICE,
    payout: BigInt(d.prize_amount),
    result: multiplier > 0 ? 'win' : 'loss',
    detail: multiplier > 0 ? `${multiplier}×` : 'Miss',
    txDigest: event.id.txDigest,
    source: 'final',
  }
}

function mapNumberMatch(event: SuiEvent): GameActivity | null {
  const d = event.parsedJson as
    | {
        game_id?: string
        picks?: number[]
        winning_number?: number
        is_win?: boolean
        cost?: string
        payout?: string
      }
    | undefined
  if (
    typeof d?.cost !== 'string' ||
    typeof d?.payout !== 'string' ||
    !Array.isArray(d?.picks)
  ) {
    console.warn('[history] malformed numbermatch event', event)
    return null
  }
  return {
    id: `numbermatch-${event.id.txDigest}-${event.id.eventSeq}`,
    gameType: 'numbermatch',
    timestampMs: Number(event.timestampMs ?? 0),
    spent: BigInt(d.cost),
    payout: BigInt(d.payout),
    result: d.is_win ? 'win' : 'loss',
    detail: `Picks [${d.picks.join(',')}] → ${d.winning_number}`,
    txDigest: event.id.txDigest,
    source: 'final',
  }
}

// Lottery uses round-object-derived results. PrizeClaimed events are NOT
// consumed here; round.drawnNumbers + getTicketTier is deterministic.

interface ParsedTicket {
  ticketId: number
  roundId: string
  roundNumber: number
  numbers: number[]
  amount: bigint
  timestampMs: number
  txDigest: string
  eventSeq: string
}

function parseTicketEvent(event: SuiEvent): ParsedTicket | null {
  const d = event.parsedJson as
    | {
        round_id?: string
        round_number?: string
        ticket_id?: string
        numbers?: number[]
        amount?: string
      }
    | undefined
  if (
    typeof d?.round_id !== 'string' ||
    !Array.isArray(d?.numbers) ||
    typeof d?.amount !== 'string'
  ) {
    console.warn('[history] malformed ticket event', event)
    return null
  }
  return {
    ticketId: Number(d.ticket_id),
    roundId: d.round_id,
    roundNumber: Number(d.round_number),
    numbers: d.numbers.map(Number),
    amount: BigInt(d.amount),
    timestampMs: Number(event.timestampMs ?? 0),
    txDigest: event.id.txDigest,
    eventSeq: event.id.eventSeq,
  }
}

async function fetchRoundsByIds(roundIds: string[]): Promise<Map<string, LotteryRound>> {
  const cache = new Map<string, LotteryRound>()
  if (roundIds.length === 0) return cache
  const client = getSuiClient()
  for (let i = 0; i < roundIds.length; i += 50) {
    const chunk = roundIds.slice(i, i + 50)
    let results: Awaited<ReturnType<typeof client.multiGetObjects>>
    try {
      results = await client.multiGetObjects({
        ids: chunk,
        options: { showContent: true },
      })
    } catch (e) {
      // One chunk failure shouldn't kill the whole history — tickets in this
      // chunk stay pending until the next refetch.
      console.warn('[history] multiGetObjects chunk failed', e)
      continue
    }
    for (const obj of results) {
      if (obj.data?.content?.dataType === 'moveObject') {
        try {
          const round = parseLotteryRoundFields(
            obj.data.objectId,
            obj.data.content.fields as Record<string, unknown>,
          )
          cache.set(round.id, round)
        } catch {
          // Round failed to parse; tickets stay pending.
        }
      }
    }
  }
  return cache
}

function resolveTicketResults(
  tickets: ParsedTicket[],
  rounds: Map<string, LotteryRound>,
): GameActivity[] {
  return tickets.map((t) => {
    const round = rounds.get(t.roundId)
    let result: ActivityResult = 'pending'
    let payout = 0n
    let tierLabel = ''

    if (round?.drawnNumbers) {
      // countMatchingNumbers signature: (ticket, drawn) — ticket numbers first.
      const matches = countMatchingNumbers(t.numbers, round.drawnNumbers)
      const tier = getTicketTier(matches)
      if (tier !== PRIZE_TIER.NONE) {
        result = 'win'
        payout = getTierPayout(round, tier)
        tierLabel = ` (${getTierLabel(tier)})`
      } else {
        result = 'loss'
      }
    }

    return {
      id: `lottery-${t.txDigest}-${t.eventSeq}`,
      gameType: 'lottery',
      timestampMs: t.timestampMs,
      spent: t.amount,
      payout,
      result,
      detail: `R${t.roundNumber} #${t.ticketId}${tierLabel}`,
      txDigest: t.txDigest,
      source: 'lottery-derived',
    }
  })
}

function mapMines(event: SuiEvent): GameActivity | null {
  const d = event.parsedJson as
    | {
        session_id?: string
        bet_amount?: string
        payout?: string
        outcome?: number
        timestamp_ms?: string
      }
    | undefined
  if (
    typeof d?.bet_amount !== 'string' ||
    typeof d?.payout !== 'string' ||
    typeof d?.outcome !== 'number'
  ) {
    console.warn('[history] malformed mines event', event)
    return null
  }
  // mines.move: STATUS_CASHED_OUT = 1, STATUS_EXPLODED = 2
  const STATUS_CASHED_OUT = 1
  const bet = BigInt(d.bet_amount)
  const payout = BigInt(d.payout)
  const isWin = d.outcome === STATUS_CASHED_OUT && payout > 0n
  const multBps = bet > 0n ? Number((payout * 10_000n) / bet) : 0
  const multStr = (multBps / 10_000).toFixed(2)
  return {
    id: `mines-${event.id.txDigest}-${event.id.eventSeq}`,
    gameType: 'mines',
    timestampMs: Number(d.timestamp_ms ?? event.timestampMs ?? 0),
    spent: bet,
    payout,
    result: isWin ? 'win' : 'loss',
    detail: isWin ? `Cashed @${multStr}×` : 'Exploded',
    txDigest: event.id.txDigest,
    source: 'final',
  }
}

interface ParsedCashout {
  multBps: bigint
  txDigest: string
  eventSeq: string
}

function mapCrash(bets: SuiEvent[], cashouts: SuiEvent[]): GameActivity[] {
  // round_id → cashout. Only the sender's own cashout is in this list.
  const cashoutByRound = new Map<string, ParsedCashout>()
  for (const e of cashouts) {
    const d = e.parsedJson as { round_id?: string; multiplier_bps?: string } | undefined
    if (typeof d?.round_id !== 'string' || typeof d?.multiplier_bps !== 'string') continue
    try {
      const next = {
        multBps: BigInt(d.multiplier_bps),
        txDigest: e.id.txDigest,
        eventSeq: e.id.eventSeq,
      }
      const existing = cashoutByRound.get(d.round_id)
      if (existing && existing.multBps !== next.multBps) {
        // Contract today emits one CashOutRecorded per (round, player). If
        // future contract changes allow multiple, prefer the highest multBps
        // (most generous attempted cashout) and warn so we notice.
        console.warn('[history] duplicate crash cashout for round', d.round_id, {
          existing: existing.multBps.toString(),
          next: next.multBps.toString(),
        })
        if (next.multBps > existing.multBps) cashoutByRound.set(d.round_id, next)
      } else {
        cashoutByRound.set(d.round_id, next)
      }
    } catch {
      console.warn('[history] bad crash multiplier_bps', d.multiplier_bps)
    }
  }

  const now = Date.now()
  const out: GameActivity[] = []

  for (const e of bets) {
    const d = e.parsedJson as
      | { round_id?: string; amount?: string; timestamp_ms?: string }
      | undefined
    if (typeof d?.round_id !== 'string' || typeof d?.amount !== 'string') {
      console.warn('[history] malformed crash bet event', e)
      continue
    }
    const roundId = d.round_id
    const bet = BigInt(d.amount)
    const ts = Number(d.timestamp_ms ?? e.timestampMs ?? 0)
    // Stable id keyed off the BetPlaced event so the row is identifiable
    // regardless of which downstream events arrive.
    const id = `crash-${e.id.txDigest}-${e.id.eventSeq}`
    const cashout = cashoutByRound.get(roundId)

    // Guard against missing/zero timestamps from indexer/RPC quirks. Without
    // this, `elapsed = now` (huge), and the row falls into the loss branch
    // silently — better to surface as pending so the user notices.
    if (!cashout && (!Number.isFinite(ts) || ts <= 0)) {
      console.warn('[history] crash bet missing timestamp; row pending', {
        roundId,
        eventTs: e.timestampMs,
        bodyTs: d.timestamp_ms,
      })
      out.push({
        id,
        gameType: 'crash',
        timestampMs: 0,
        spent: bet,
        payout: 0n,
        result: 'pending',
        detail: `R${roundId} (settling…)`,
        txDigest: e.id.txDigest,
        source: 'optimistic-pending',
      })
      continue
    }

    if (cashout) {
      // Optimistic win. cash_out emit ≠ resolve_round confirmed win, but in
      // practice the user's client only enables cashout when live multiplier
      // < crash_point, so phantom wins are rare. The Tx link points at the
      // cashout transaction (where the payout actually executes).
      const payout = (bet * cashout.multBps) / 10_000n
      const multStr = (Number(cashout.multBps) / 10_000).toFixed(2)
      out.push({
        id,
        gameType: 'crash',
        timestampMs: ts,
        spent: bet,
        payout,
        result: 'win',
        detail: `R${roundId} @${multStr}×`,
        txDigest: cashout.txDigest,
        source: 'optimistic-cashout',
      })
      continue
    }

    const elapsed = now - ts
    if (elapsed < 0) {
      // Future timestamp — almost certainly a clock-skew client. Show as
      // pending with diagnostic so the user can investigate rather than
      // silently hiding the row.
      console.warn('[history] crash bet timestamp in future; clock may be off', {
        roundId,
        ts,
        now,
      })
      out.push({
        id,
        gameType: 'crash',
        timestampMs: ts,
        spent: bet,
        payout: 0n,
        result: 'pending',
        detail: `R${roundId} (settling… verify clock)`,
        txDigest: e.id.txDigest,
        source: 'optimistic-pending',
      })
      continue
    }
    if (elapsed < CRASH_FINALIZE_WINDOW_MS + CLOCK_SKEW_MS) {
      // Within the settling window: bet is acknowledged but cashout (if any)
      // hasn't propagated yet. Show as pending so the user sees the bet was
      // recorded; the next refetch promotes to win/loss.
      out.push({
        id,
        gameType: 'crash',
        timestampMs: ts,
        spent: bet,
        payout: 0n,
        result: 'pending',
        detail: `R${roundId} (settling…)`,
        txDigest: e.id.txDigest,
        source: 'optimistic-pending',
      })
      continue
    }

    // Window elapsed without a cashout — presumed loss. Stuck-round (refund)
    // cases will mis-classify here; they need the LT-3 indexer.
    out.push({
      id,
      gameType: 'crash',
      timestampMs: ts,
      spent: bet,
      payout: 0n,
      result: 'loss',
      detail: `R${roundId} crashed`,
      txDigest: e.id.txDigest,
      source: 'optimistic-no-cashout',
    })
  }
  return out
}

// === Public API ===

export interface GameHistoryData {
  activities: GameActivity[]
  isTruncated: boolean
}

export async function fetchAllGameHistory(address: string): Promise<GameHistoryData> {
  const raw = await fetchUserGameEvents(address)

  const scratchItems = raw.scratch
    .map(mapScratch)
    .filter((x): x is GameActivity => x !== null)
  const nmItems = raw.numbermatch
    .map(mapNumberMatch)
    .filter((x): x is GameActivity => x !== null)
  const minesItems = raw.mines
    .map(mapMines)
    .filter((x): x is GameActivity => x !== null)
  const crashItems = mapCrash(raw.crashBet, raw.crashCash)

  const tickets = raw.lottery
    .map(parseTicketEvent)
    .filter((x): x is ParsedTicket => x !== null)
  const roundIds = [...new Set(tickets.map((t) => t.roundId))]
  const rounds = await fetchRoundsByIds(roundIds)
  const lotteryItems = resolveTicketResults(tickets, rounds)

  return {
    activities: [
      ...scratchItems,
      ...nmItems,
      ...minesItems,
      ...crashItems,
      ...lotteryItems,
    ].sort((a, b) => b.timestampMs - a.timestampMs),
    isTruncated: raw.isTruncated,
  }
}
