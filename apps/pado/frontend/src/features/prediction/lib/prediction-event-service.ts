/**
 * PredictionEventService - per-tab polling subscription for prediction_market events.
 *
 * Spot's EventService (../../lib/event-service.ts) handles DeepBook events with a
 * single-pool filter; prediction events live in a different package + namespace
 * and use `market_id` rather than `pool_id`. Forking keeps the two services
 * decoupled and lets us use Sui's `MoveEventModule` filter to fetch every
 * prediction_market event type in a single RPC per tick.
 *
 * One singleton per tab. Hooks call `getPredictionEventService().subscribe(...)`
 * and unsubscribe on unmount; the service connects/disconnects implicitly based
 * on subscriber count. Page Visibility pauses polling when the tab is hidden.
 *
 * 2026-05-20 v5 cutover: runs N parallel pollers (one per unique originalId)
 * with per-package cursors so v1~v4 in-flight markets keep emitting live
 * events even after the fresh v5 publish. Subscribers are package-agnostic —
 * the dispatch normalizes by struct name, not by full event type, so a
 * subscriber to `OrderFilled` receives both legacy and v5 fills as a single
 * stream.
 */

import { getSuiClient } from '../../../lib/sui-client';
import {
  PREDICTION_ORIGINAL_PACKAGE_ID,
  LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID,
  PREDICTION_LEGACY,
} from '../constants';

// Event type names mirror Move struct names so subscribers can read parsedJson
// without translation. Add new ones here as new events are introduced.
export type PredictionEventType =
  | 'OrderFilled'
  | 'OrderPlaced'
  | 'OrderCancelled'
  | 'MarketResolved'
  | 'MarketCreated'
  | 'MarketCancelled'
  | 'TokensMinted'
  | 'WinningsClaimed';

export interface PredictionEventEnvelope {
  type: PredictionEventType;
  parsedJson: Record<string, unknown>;
  timestampMs: number;
  txDigest: string;
  eventSeq: string;
  /**
   * 2026-05-20 v5 cutover: which originalId emitted this event. Subscribers
   * that care about the v5/legacy split (e.g. UI badges) can branch on this;
   * most don't need to.
   */
  sourcePackage: string;
}

export type PredictionEventCallback = (event: PredictionEventEnvelope) => void;

const POLLING_INTERVAL = 5000; // 5s
const MAX_POLLING_INTERVAL = 30000; // 30s exp-backoff cap
const MAX_EVENTS_PER_POLL = 100;

const STRUCT_TO_TYPE: Record<string, PredictionEventType> = {
  OrderFilled: 'OrderFilled',
  OrderPlaced: 'OrderPlaced',
  OrderCancelled: 'OrderCancelled',
  MarketResolved: 'MarketResolved',
  MarketCreated: 'MarketCreated',
  MarketCancelled: 'MarketCancelled',
  TokensMinted: 'TokensMinted',
  WinningsClaimed: 'WinningsClaimed',
};

interface PerPackageState {
  packageId: string;
  cursor: { txDigest: string; eventSeq: string } | null;
  bootstrapDone: boolean;
}

class PredictionEventService {
  private subscribers: Map<PredictionEventType, Set<PredictionEventCallback>> = new Map();
  private packages: PerPackageState[] = this.buildPackageList();
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private isConnected = false;
  private visibilityHandler: (() => void) | null = null;

  private buildPackageList(): PerPackageState[] {
    const pkgs = new Set<string>();
    if (PREDICTION_ORIGINAL_PACKAGE_ID) pkgs.add(PREDICTION_ORIGINAL_PACKAGE_ID);
    if (PREDICTION_LEGACY && LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID) {
      pkgs.add(LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID);
    }
    return Array.from(pkgs).map((packageId) => ({
      packageId,
      cursor: null,
      bootstrapDone: false,
    }));
  }

  subscribe(eventType: PredictionEventType, callback: PredictionEventCallback): () => void {
    let bucket = this.subscribers.get(eventType);
    if (!bucket) {
      bucket = new Set();
      this.subscribers.set(eventType, bucket);
    }
    bucket.add(callback);
    this.ensureConnected();

    return () => {
      const bucketRef = this.subscribers.get(eventType);
      if (!bucketRef) return;
      bucketRef.delete(callback);
      if (this.subscriberCount() === 0) {
        this.disconnect();
      }
    };
  }

  private subscriberCount(): number {
    let n = 0;
    this.subscribers.forEach((s) => { n += s.size; });
    return n;
  }

  private ensureConnected(): void {
    if (this.isConnected) return;
    this.isConnected = true;
    this.attachVisibilityHandler();
    // Bootstrap each package's cursor on first poll.
    for (const pkg of this.packages) {
      pkg.bootstrapDone = false;
      pkg.cursor = null;
    }
    this.scheduleNextPoll(0);
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    for (const pkg of this.packages) {
      pkg.cursor = null;
      pkg.bootstrapDone = false;
    }
    this.consecutiveFailures = 0;
  }

  private attachVisibilityHandler(): void {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.isConnected) {
        if (this.pollingTimer) clearTimeout(this.pollingTimer);
        this.poll().then(() => this.scheduleNextPoll(POLLING_INTERVAL));
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private scheduleNextPoll(delayOverrideMs?: number): void {
    if (!this.isConnected) return;
    if (this.pollingTimer) clearTimeout(this.pollingTimer);

    const exponent = Math.min(this.consecutiveFailures, 4);
    const delay = delayOverrideMs ?? Math.min(POLLING_INTERVAL * Math.pow(2, exponent), MAX_POLLING_INTERVAL);

    this.pollingTimer = setTimeout(async () => {
      if (document.visibilityState === 'hidden') {
        this.scheduleNextPoll();
        return;
      }
      await this.poll();
      this.scheduleNextPoll();
    }, delay);
  }

  private async poll(): Promise<void> {
    if (this.packages.length === 0) return;
    const client = getSuiClient();

    // Poll every package in parallel; share a single failure counter so any
    // partial network blip backs everyone off together (RPC is shared too).
    const results = await Promise.allSettled(
      this.packages.map(async (pkg) => {
        if (!pkg.bootstrapDone) {
          const tip = await client.queryEvents({
            query: {
              MoveEventModule: { package: pkg.packageId, module: 'prediction_market' },
            },
            limit: 1,
            order: 'descending',
          });
          if (tip.data[0]?.id) {
            pkg.cursor = {
              txDigest: tip.data[0].id.txDigest,
              eventSeq: tip.data[0].id.eventSeq,
            };
          }
          pkg.bootstrapDone = true;
          return [] as unknown[];
        }

        const result = await client.queryEvents({
          query: {
            MoveEventModule: { package: pkg.packageId, module: 'prediction_market' },
          },
          cursor: pkg.cursor as { txDigest: string; eventSeq: string } | undefined,
          limit: MAX_EVENTS_PER_POLL,
          order: 'ascending',
        });

        if (result.nextCursor) {
          pkg.cursor = result.nextCursor as { txDigest: string; eventSeq: string };
        }

        return result.data;
      }),
    );

    let anyFailure = false;
    for (const r of results) {
      if (r.status === 'rejected') {
        anyFailure = true;
        console.warn('[PredictionEventService] poll error:', r.reason);
        continue;
      }
      for (const ev of r.value) {
        this.dispatch(ev);
      }
    }

    if (anyFailure) {
      this.consecutiveFailures += 1;
    } else {
      this.consecutiveFailures = 0;
    }
  }

  private dispatch(rawEvent: unknown): void {
    const ev = rawEvent as {
      id?: { txDigest: string; eventSeq: string };
      type?: string;
      timestampMs?: string;
      parsedJson?: Record<string, unknown>;
    };
    if (!ev.id || !ev.type || !ev.parsedJson) return;

    // ev.type is the full Move event path: <package>::prediction_market::<Struct>
    const segments = ev.type.split('::');
    const lastSeg = segments[segments.length - 1] ?? '';
    const sourcePackage = segments[0] ?? '';
    const eventType = STRUCT_TO_TYPE[lastSeg];
    if (!eventType) return;

    const envelope: PredictionEventEnvelope = {
      type: eventType,
      parsedJson: ev.parsedJson,
      timestampMs: Number(ev.timestampMs) || Date.now(),
      txDigest: ev.id.txDigest,
      eventSeq: ev.id.eventSeq,
      sourcePackage,
    };

    const bucket = this.subscribers.get(eventType);
    if (!bucket) return;
    bucket.forEach((cb) => {
      try {
        cb(envelope);
      } catch (err) {
        console.error('[PredictionEventService] subscriber error:', err);
      }
    });
  }
}

let instance: PredictionEventService | null = null;

export function getPredictionEventService(): PredictionEventService {
  if (!instance) {
    instance = new PredictionEventService();
  }
  return instance;
}

export type { PredictionEventService };
