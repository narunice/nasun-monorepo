/**
 * Game history client. Sender-based event query for scratch/nm/mines/lottery
 * + backend REST for crash (authoritative on-chain settlement persisted by
 * the chat-server keeper). Crash event reconciliation in the browser was
 * removed in favor of the keeper-owned history backend; the same on-chain
 * GameResult event the keeper already receives in the resolve_round response
 * is the source of truth.
 */

import type { SuiEvent, EventId } from '@mysten/sui/client'
import { getSuiClient } from '../../../lib/sui-client'
import {
  SCRATCH_PURCHASED_EVENT_TYPE,
  SCRATCH_CARD_PRICE,
  NM_PLAYED_EVENT_TYPE,
  TICKET_PURCHASED_EVENT_TYPE,
  MINES_SESSION_FINISHED_EVENT_TYPE,
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

// === Sender event fetcher ===

const EVENT_TYPES = {
  scratch: SCRATCH_PURCHASED_EVENT_TYPE,
  nm: NM_PLAYED_EVENT_TYPE,
  ticket: TICKET_PURCHASED_EVENT_TYPE,
  minesFinished: MINES_SESSION_FINISHED_EVENT_TYPE,
}
const ALL_EVENT_TYPES = new Set(Object.values(EVENT_TYPES).filter((s) => s.length > 0))

interface RawEvents {
  scratch: SuiEvent[]
  numbermatch: SuiEvent[]
  lottery: SuiEvent[]
  mines: SuiEvent[]
  isTruncated: boolean
}

async function fetchUserGameEvents(address: string): Promise<RawEvents> {
  const client = getSuiClient()
  const out: RawEvents = {
    scratch: [],
    numbermatch: [],
    lottery: [],
    mines: [],
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
    }

    if (!result.hasNextPage) {
      exhausted = true
      break
    }
    if (!result.nextCursor) {
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

// === Crash backend client ===

interface CrashHistoryRow {
  round_id: number
  bet_amount: string
  payout: string
  multiplier_bps: number
  timestamp_ms: number
  resolve_tx: string
}

interface CrashHistoryResponse {
  items: CrashHistoryRow[]
  serverTime: number
}

function resolveCrashHistoryUrl(): string {
  // Derive from VITE_CHAT_SERVER_URL — gostop already uses this for crash WS/state.
  // Fallback to local dev port to keep `pnpm dev` working without extra env.
  const explicit = import.meta.env.VITE_CHAT_SERVER_URL as string | undefined
  const base = explicit ? explicit.replace(/\/$/, '') : 'http://localhost:3101'
  return `${base}/api/crash/history`
}

interface CrashFetchOutcome {
  items: GameActivity[]
  backendError: boolean
}

async function fetchCrashHistoryFromBackend(address: string): Promise<CrashFetchOutcome> {
  const url = `${resolveCrashHistoryUrl()}?address=${encodeURIComponent(address)}&limit=200`
  let body: CrashHistoryResponse
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`status ${r.status}`)
    body = (await r.json()) as CrashHistoryResponse
  } catch (err) {
    console.warn('[history] crash backend fetch failed', err)
    return { items: [], backendError: true }
  }
  const items: GameActivity[] = (body.items ?? []).map((it) => {
    const bet = BigInt(it.bet_amount)
    const payout = BigInt(it.payout)
    const isWin = payout > 0n
    const multStr = (it.multiplier_bps / 10_000).toFixed(2)
    return {
      id: `crash-${it.round_id}`,
      gameType: 'crash',
      timestampMs: it.timestamp_ms,
      spent: bet,
      payout,
      result: isWin ? 'win' : 'loss',
      detail: isWin ? `R${it.round_id} @${multStr}×` : `R${it.round_id} crashed`,
      txDigest: it.resolve_tx,
      source: 'backend-resolved',
    }
  })
  return { items, backendError: false }
}

// === Public API ===

export interface GameHistoryData {
  activities: GameActivity[]
  isTruncated: boolean
  crashBackendError: boolean
}

export async function fetchAllGameHistory(address: string): Promise<GameHistoryData> {
  // Crash and the on-chain event scan are independent — fetch in parallel.
  const [raw, crashOutcome] = await Promise.all([
    fetchUserGameEvents(address),
    fetchCrashHistoryFromBackend(address),
  ])

  const scratchItems = raw.scratch
    .map(mapScratch)
    .filter((x): x is GameActivity => x !== null)
  const nmItems = raw.numbermatch
    .map(mapNumberMatch)
    .filter((x): x is GameActivity => x !== null)
  const minesItems = raw.mines
    .map(mapMines)
    .filter((x): x is GameActivity => x !== null)

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
      ...crashOutcome.items,
      ...lotteryItems,
    ].sort((a, b) => b.timestampMs - a.timestampMs),
    isTruncated: raw.isTruncated,
    crashBackendError: crashOutcome.backendError,
  }
}
