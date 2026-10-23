/**
 * Chat Activity Scanner
 *
 * Detects chat participation by querying REST APIs on
 * nasun-website and pado chat servers.
 *
 * Chat is entirely off-chain (WebSocket + SQLite), so the event-based
 * scanner cannot detect it. This module queries chat server REST APIs
 * instead, following the same pattern as faucet-scanner.ts.
 *
 * Design:
 * - Runs once per scanLoop, after faucet scanning
 * - Fetches GET /api/chat-participation?date=YYYY-MM-DD from configured servers
 * - Daily category cap is enforced by insertDailyCappedPoints (one row per
 *   identity/category/UTC day, decided inside the INSERT)
 * - Synthetic tx_digest format: chat:{walletAddress}:{YYYY-MM-DD}
 * - tx_sequence_number: 0 (no on-chain tx)
 * - Idempotent: UNIQUE(tx_digest, activity_type, event_seq) + ON CONFLICT DO NOTHING
 */

import { pointsDb } from '../db.js';
import {
  insertDailyCappedPoints,
  type CappedPointsInsert,
} from './daily-capped-insert.js';

// Array parser retained for future multi-app expansion; current policy is single URL
// (nasun-chat-server hub). See .claude/handoffs/2026-04-12-chat-server-role-clarification.md
const CHAT_SERVER_URLS = (process.env.CHAT_SERVER_URLS || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const FETCH_TIMEOUT_MS = 5_000;

// In-memory cache to avoid fetching every scan cycle (60s TTL)
let cachedDate = '';
let cachedParticipants = new Set<string>();
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

async function fetchAllChatParticipants(dateStr: string): Promise<Set<string>> {
  const now = Date.now();
  if (dateStr === cachedDate && now - cachedAt < CACHE_TTL_MS) {
    return cachedParticipants;
  }

  const all = new Set<string>();
  await Promise.allSettled(
    CHAT_SERVER_URLS.map(async (baseUrl) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(
          `${baseUrl}/api/chat-participation?date=${dateStr}`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        if (!res.ok) {
          console.warn(`[Chat] ${baseUrl} returned ${res.status}`);
          return;
        }
        const data = (await res.json()) as { participants: string[] };
        for (const addr of data.participants) all.add(addr.toLowerCase());
      } catch (err) {
        clearTimeout(timer);
        console.warn(
          `[Chat] ${baseUrl} fetch failed:`,
          (err as Error).message,
        );
      }
    }),
  );

  // Update cache only if we got results (avoid caching empty on transient failure)
  if (all.size > 0 || CHAT_SERVER_URLS.length === 0) {
    cachedDate = dateStr;
    cachedParticipants = all;
    cachedAt = now;
  }

  return all;
}

/**
 * Scan for chat participation and insert activity points.
 *
 * @param registeredWallets - Map<walletAddress (lowercase 0x), identityId>
 * @returns Number of points rows inserted
 */
export async function scanChatParticipation(
  registeredWallets: Map<string, string>,
): Promise<number> {
  if (
    !pointsDb ||
    registeredWallets.size === 0 ||
    CHAT_SERVER_URLS.length === 0
  )
    return 0;

  const today = new Date().toISOString().slice(0, 10);
  const participants = await fetchAllChatParticipants(today);
  if (participants.size === 0) return 0;

  const inserts: CappedPointsInsert[] = [];

  for (const addr of participants) {
    const walletAddress = addr.startsWith('0x') ? addr : `0x${addr}`;
    const identityId = registeredWallets.get(walletAddress);
    if (!identityId) continue;

    inserts.push({
      wallet_address: walletAddress,
      identity_id: identityId,
      tx_digest: `chat:${addr}:${today}`,
      tx_sequence_number: 0,
      category: 'chat',
      activity_type: 'participation',
      base_points: 1,
      volume_tier: 1.0,
      genesis_multiplier: 1.0,
      final_points: '1.00',
      tx_timestamp: new Date(`${today}T00:00:00.000Z`),
      event_seq: 0,
    });
  }

  // Participants are re-fetched every cycle with no cursor, so every one of
  // today's participants is offered again each time. The INSERT decides: the
  // cap drops the ones already credited today, and this counts what landed.
  const insertedRows = await insertDailyCappedPoints(inserts);
  if (insertedRows > 0) {
    console.log(`[Chat] Recorded ${insertedRows} chat participants`);
  }

  return insertedRows;
}
