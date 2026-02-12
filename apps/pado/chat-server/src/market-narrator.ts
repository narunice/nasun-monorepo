/**
 * Market Narrator — hybrid rule-based + AI market commentary bot.
 *
 * Rule-based: instant alerts from price-tracker ($0 cost).
 * AI (optional): periodic summaries via Claude Haiku (~$0.04/day at 12 calls/day).
 * Gracefully degrades when ANTHROPIC_API_KEY is not set.
 */

import type { TradeFillData } from './leaderboard-types.js';
import {
  updatePool,
  getAllPoolStates,
  hasActivity,
  type PriceAlert,
  type PoolState,
} from './price-tracker.js';
import { getPoolRoom, getPoolSymbol } from './rooms.js';

// ===== Configuration =====

export interface NarratorConfig {
  broadcast: (content: string) => void;
  broadcastToRoom?: (content: string, poolRoomId: number) => void;
  minIntervalMs?: number;         // min gap between messages (default: 30s)
  maxMessagesPerHour?: number;     // hourly cap (default: 10)
  aiSummaryIntervalMs?: number;    // AI summary period (default: 2 hours)
  anthropicApiKey?: string;        // optional — AI disabled if absent
}

const DEFAULT_MIN_INTERVAL_MS = 30_000;      // 30 seconds
const DEFAULT_MAX_PER_HOUR = 10;
const DEFAULT_AI_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const BOT_PREFIX = '[BOT] ';

// ===== State =====

const MAX_BOT_MESSAGE_LENGTH = 500;

let config: NarratorConfig | null = null;
let lastMessageMs = 0;
let hourlyCount = 0;
let hourlyResetMs = 0;
let aiSummaryTimer: ReturnType<typeof setInterval> | null = null;
let cachedAiClient: unknown = null; // Cached Anthropic client instance

// ===== Rate Limiting =====

function maybeResetHourlyCounter(now: number): void {
  if (now - hourlyResetMs >= 3_600_000) {
    hourlyCount = 0;
    hourlyResetMs = now;
  }
}

function canSendMessage(): boolean {
  if (!config) return false;

  const now = Date.now();
  maybeResetHourlyCounter(now);

  if (now - lastMessageMs < (config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS)) return false;
  if (hourlyCount >= (config.maxMessagesPerHour ?? DEFAULT_MAX_PER_HOUR)) return false;

  return true;
}

function recordMessageSent(): void {
  const now = Date.now();
  maybeResetHourlyCounter(now);
  lastMessageMs = now;
  hourlyCount++;
}

// ===== Message Formatting =====

function formatAlert(alert: PriceAlert): string {
  const { type, poolId, data } = alert;
  const symbol = getPoolSymbol(poolId) ?? 'tokens';
  const pair = `${symbol}/NUSDC`;

  switch (type) {
    case 'price_move': {
      const pct = data.pctChange as number;
      const from = (data.fromPrice as number).toLocaleString('en-US', { maximumFractionDigits: 2 });
      const to = (data.toPrice as number).toLocaleString('en-US', { maximumFractionDigits: 2 });
      const direction = pct > 0 ? '+' : '';
      return `${symbol} price moved ${direction}${pct}% in the last 5 minutes ($${from} → $${to})`;
    }

    case 'volume_spike': {
      const ratio = data.ratio as number;
      return `Trading volume surge on ${pair} — ${ratio}x above average`;
    }

    case 'momentum': {
      const streak = data.streak as number;
      const direction = data.direction as string;
      const sentiment = direction === 'buy' ? 'bulls are pushing' : 'sellers are pressing';
      return `${streak} consecutive ${direction}s on ${symbol} — ${sentiment}`;
    }

    default:
      return '';
  }
}

// ===== AI Summary =====

function buildSummaryPrompt(states: Map<string, PoolState>): string {
  const lines: string[] = ['Current market state for Pado DEX (NBTC/NUSDC pool):'];

  for (const [, state] of states) {
    if (state.fillCount === 0) continue;
    lines.push(
      `- Last price: $${state.lastPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      `- Baseline price (EWMA): $${state.baselinePrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      `- 5-min volume: $${Math.round(state.volume5m).toLocaleString('en-US')}`,
      `- Total fills tracked: ${state.fillCount}`,
      `- Last consecutive buys: ${state.consecutiveBuys}, sells: ${state.consecutiveSells}`,
    );
  }

  if (lines.length === 1) {
    lines.push('- No recent trading activity.');
  }

  lines.push('', 'Write 1-2 sentences summarizing the current market conditions.');
  return lines.join('\n');
}

async function generateAiSummary(): Promise<void> {
  if (!config?.anthropicApiKey) return;
  if (!hasActivity()) return;

  try {
    // Cache the Anthropic client across calls (module is cached by Node.js)
    if (!cachedAiClient) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      cachedAiClient = new Anthropic({ apiKey: config.anthropicApiKey });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = cachedAiClient as any;

    const states = getAllPoolStates();
    const prompt = buildSummaryPrompt(states);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: 'You are a concise market narrator for Pado DEX, a decentralized exchange. Write 1-2 sentences summarizing recent trading activity. Be factual and engaging. No emojis. No financial advice. No disclaimers.',
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    const text = block?.type === 'text' ? block.text : null;
    if (text && canSendMessage()) {
      const sanitized = text.trim().slice(0, MAX_BOT_MESSAGE_LENGTH);
      if (sanitized.length > 0) {
        config.broadcast(`${BOT_PREFIX}${sanitized}`);
        recordMessageSent();
        console.log('[Narrator] AI summary sent');
      }
    }
  } catch (err) {
    // AI failure should never crash the server or block rule-based messages
    console.warn('[Narrator] AI summary failed:', (err as Error).message);
  }
}

// ===== Public API =====

/**
 * Initialize the narrator. Must be called once at server startup.
 */
export function initNarrator(cfg: NarratorConfig): void {
  config = cfg;
  hourlyResetMs = Date.now();

  console.log('[Narrator] Initialized (AI:', cfg.anthropicApiKey ? 'enabled' : 'disabled', ')');

  // Schedule periodic AI summaries if API key is available
  if (cfg.anthropicApiKey) {
    const interval = cfg.aiSummaryIntervalMs ?? DEFAULT_AI_INTERVAL_MS;
    aiSummaryTimer = setInterval(() => {
      generateAiSummary().catch((err) => {
        console.warn('[Narrator] AI summary timer error:', (err as Error).message);
      });
    }, interval);
    console.log(`[Narrator] AI summary scheduled every ${interval / 60_000} minutes`);
  }
}

/**
 * Process a new trade fill. Called by the indexer for every OrderFilled event.
 */
export function onTradeFill(fill: TradeFillData): void {
  if (!config) return;

  const alerts = updatePool(fill.poolId, fill);
  if (alerts.length === 0) return;
  if (!canSendMessage()) return;

  // Send the highest-priority alert (first in list)
  const msg = formatAlert(alerts[0]);
  if (msg) {
    const poolRoomId = getPoolRoom(fill.poolId);
    if (config.broadcastToRoom && poolRoomId !== null) {
      config.broadcastToRoom(`${BOT_PREFIX}${msg}`, poolRoomId);
    } else {
      config.broadcast(`${BOT_PREFIX}${msg}`);
    }
    recordMessageSent();
  }
}

/**
 * Stop the narrator (cleanup timers).
 */
export function stopNarrator(): void {
  if (aiSummaryTimer) {
    clearInterval(aiSummaryTimer);
    aiSummaryTimer = null;
  }
  cachedAiClient = null;
  config = null;
  console.log('[Narrator] Stopped');
}
