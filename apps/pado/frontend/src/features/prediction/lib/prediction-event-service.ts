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
 */

import { getSuiClient } from '../../../lib/sui-client';
import { PREDICTION_PACKAGE_ID } from '../constants';

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

class PredictionEventService {
  private subscribers: Map<PredictionEventType, Set<PredictionEventCallback>> = new Map();
  private pollingCursor: { txDigest: string; eventSeq: string } | null = null;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private isConnected = false;
  private visibilityHandler: (() => void) | null = null;
  private bootstrapDone = false;

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
    // Bootstrap cursor: first poll only delivers events newer than the bootstrap
    // tick to avoid replaying old history on every page load.
    this.bootstrapDone = false;
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
    this.pollingCursor = null;
    this.consecutiveFailures = 0;
    this.bootstrapDone = false;
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
    if (!PREDICTION_PACKAGE_ID) return;
    const client = getSuiClient();

    try {
      // First poll seeds the cursor at "tip" without firing callbacks for
      // historical events. Subsequent polls walk forward from the cursor.
      if (!this.bootstrapDone) {
        const tip = await client.queryEvents({
          query: {
            MoveEventModule: { package: PREDICTION_PACKAGE_ID, module: 'prediction_market' },
          },
          limit: 1,
          order: 'descending',
        });
        if (tip.data[0]?.id) {
          this.pollingCursor = {
            txDigest: tip.data[0].id.txDigest,
            eventSeq: tip.data[0].id.eventSeq,
          };
        }
        this.bootstrapDone = true;
        this.consecutiveFailures = 0;
        return;
      }

      const result = await client.queryEvents({
        query: {
          MoveEventModule: { package: PREDICTION_PACKAGE_ID, module: 'prediction_market' },
        },
        cursor: this.pollingCursor as { txDigest: string; eventSeq: string } | undefined,
        limit: MAX_EVENTS_PER_POLL,
        order: 'ascending',
      });

      if (result.nextCursor) {
        this.pollingCursor = result.nextCursor as { txDigest: string; eventSeq: string };
      }

      this.consecutiveFailures = 0;

      for (const ev of result.data) {
        this.dispatch(ev);
      }
    } catch (error) {
      this.consecutiveFailures += 1;
      console.warn('[PredictionEventService] poll error:', error);
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
    const lastSeg = ev.type.split('::').pop() ?? '';
    const eventType = STRUCT_TO_TYPE[lastSeg];
    if (!eventType) return;

    const envelope: PredictionEventEnvelope = {
      type: eventType,
      parsedJson: ev.parsedJson,
      timestampMs: Number(ev.timestampMs) || Date.now(),
      txDigest: ev.id.txDigest,
      eventSeq: ev.id.eventSeq,
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
