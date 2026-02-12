/**
 * EventService - Centralized event subscription layer
 *
 * Handles blockchain event subscriptions with automatic fallback:
 * WebSocket → Polling → Simulation
 */

import { getSuiClient } from './sui-client';
import { NETWORK_CONFIG } from '../config/network';
import type {
  ConnectionMode,
  EventType,
  EventCallback,
  DeepBookEvent,
  OrderFilledEvent,
  OrderPlacedEvent,
  OrderCanceledEvent,
} from '../features/trading/types/events';

// Polling configuration
const POLLING_INTERVAL = 2000; // 2 seconds
const MAX_POLLING_INTERVAL = 30000; // 30 seconds max backoff
const MAX_EVENTS_PER_POLL = 50;

// Singleton instance
let eventServiceInstance: EventService | null = null;

/**
 * Get the EventService singleton instance
 */
export function getEventService(): EventService {
  if (!eventServiceInstance) {
    eventServiceInstance = new EventService();
  }
  return eventServiceInstance;
}

/**
 * EventService class
 * Manages blockchain event subscriptions with automatic fallback
 */
export type ModeChangeCallback = (newMode: ConnectionMode, oldMode: ConnectionMode) => void;

export class EventService {
  private mode: ConnectionMode = 'simulation';
  private subscribers: Map<EventType, Set<EventCallback>> = new Map();
  private pollingCursor: { txDigest: string; eventSeq: string } | null = null;
  private pollingInterval: ReturnType<typeof setTimeout> | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private isConnecting = false;
  private poolFilter: string | null = null;
  private consecutiveFailures = 0;
  private modeChangeCallbacks: Set<ModeChangeCallback> = new Set();

  constructor() {
    // Initialize subscriber maps
    this.subscribers.set('OrderFilled', new Set());
    this.subscribers.set('OrderPlaced', new Set());
    this.subscribers.set('OrderCanceled', new Set());
  }

  /**
   * Connect to event source
   * Tries WebSocket first, falls back to polling, then simulation
   */
  async connect(poolId?: string): Promise<ConnectionMode> {
    if (this.isConnecting) {
      return this.mode;
    }

    this.isConnecting = true;
    this.poolFilter = poolId || null;

    try {
      // Nasun devnet does not support WebSocket subscriptions.
      // Skip WS to avoid reconnect spam from the Sui SDK.
      // Fall back to polling directly.
      const pollingSuccess = await this.tryPolling();
      if (pollingSuccess) {
        this.setMode('polling');
        console.log('[EventService] Connected via Polling (2s interval)');
        this.isConnecting = false;
        return this.mode;
      }

      // Fall back to simulation
      this.setMode('simulation');
      console.log('[EventService] Running in Simulation mode');
    } catch (error) {
      console.warn('[EventService] Connection error, falling back to simulation:', error);
      this.setMode('simulation');
    }

    this.isConnecting = false;
    return this.mode;
  }

  /**
   * Disconnect from event source
   */
  disconnect(): void {
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }

    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.setMode('simulation');
    this.pollingCursor = null;
    this.consecutiveFailures = 0;
  }

  /**
   * Subscribe to an event type
   * Returns unsubscribe function
   */
  subscribe(eventType: EventType, callback: EventCallback): () => void {
    const subscribers = this.subscribers.get(eventType);
    if (subscribers) {
      subscribers.add(callback);
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(eventType);
      if (subs) {
        subs.delete(callback);
      }
    };
  }

  /**
   * Get current connection mode
   */
  getMode(): ConnectionMode {
    return this.mode;
  }

  /**
   * Check if connected to real data source
   */
  isRealtime(): boolean {
    return this.mode === 'websocket' || this.mode === 'polling';
  }

  /**
   * Register a callback for mode changes (e.g. websocket → polling → simulation)
   */
  onModeChange(callback: ModeChangeCallback): () => void {
    this.modeChangeCallbacks.add(callback);
    return () => { this.modeChangeCallbacks.delete(callback); };
  }

  private setMode(newMode: ConnectionMode): void {
    const oldMode = this.mode;
    if (oldMode === newMode) return;
    this.mode = newMode;
    this.modeChangeCallbacks.forEach(cb => {
      try { cb(newMode, oldMode); } catch { /* ignore */ }
    });
  }

  /**
   * Try polling connection
   */
  private async tryPolling(): Promise<boolean> {
    const client = getSuiClient();
    const deepbookPackage = NETWORK_CONFIG.deepbookPackage;

    if (!deepbookPackage) {
      return false;
    }

    try {
      // Test query to check if events API works
      await client.queryEvents({
        query: {
          MoveEventType: `${deepbookPackage}::pool::OrderFilled`,
        },
        limit: 1,
      });

      // Start polling
      this.startPolling();
      return true;
    } catch (error) {
      console.warn('[EventService] Polling query failed:', error);
      return false;
    }
  }

  /**
   * Start polling for events
   */
  private startPolling(): void {
    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
    }

    const exponent = Math.min(this.consecutiveFailures, 4); // cap at 2^4 = 16x
    const delay = Math.min(
      POLLING_INTERVAL * Math.pow(2, exponent),
      MAX_POLLING_INTERVAL
    );

    this.pollingInterval = setTimeout(async () => {
      await this.pollEvents();
      this.scheduleNextPoll();
    }, delay);
  }

  /**
   * Poll for new events
   */
  private async pollEvents(): Promise<void> {
    const client = getSuiClient();
    const deepbookPackage = NETWORK_CONFIG.deepbookPackage;

    if (!deepbookPackage) return;

    try {
      const result = await client.queryEvents({
        query: {
          MoveEventType: `${deepbookPackage}::pool::OrderFilled`,
        },
        cursor: this.pollingCursor as { txDigest: string; eventSeq: string } | undefined,
        limit: MAX_EVENTS_PER_POLL,
        order: 'ascending',
      });

      // Update cursor for next poll
      if (result.nextCursor) {
        this.pollingCursor = result.nextCursor as { txDigest: string; eventSeq: string };
      }

      // Reset backoff on success
      this.consecutiveFailures = 0;

      // Process events
      for (const event of result.data) {
        this.handlePolledEvent('OrderFilled', event);
      }
    } catch (error) {
      this.consecutiveFailures++;
      console.warn(`[EventService] Polling error (attempt ${this.consecutiveFailures}):`, error);
    }
  }

  /**
   * Handle polled event
   */
  private handlePolledEvent(type: EventType, event: unknown): void {
    const parsedEvent = this.parseEvent(type, event);
    if (parsedEvent) {
      this.notifySubscribers(parsedEvent);
    }
  }

  /**
   * Parse raw event into typed event
   */
  private parseEvent(type: EventType, rawEvent: unknown): DeepBookEvent | null {
    try {
      const event = rawEvent as {
        id?: { txDigest: string; eventSeq: string };
        timestampMs?: string;
        parsedJson?: Record<string, unknown>;
      };

      const txDigest = event.id?.txDigest || '';
      const timestamp = Number(event.timestampMs) || Date.now();
      const json = event.parsedJson || {};

      // Filter by pool if set
      if (this.poolFilter && json.pool_id !== this.poolFilter) {
        return null;
      }

      switch (type) {
        case 'OrderFilled': {
          const data: OrderFilledEvent = {
            poolId: String(json.pool_id || ''),
            makerOrderId: String(json.maker_order_id || ''),
            takerOrderId: String(json.taker_order_id || ''),
            price: BigInt(String(json.price || 0)),
            quantity: BigInt(String(json.quantity || json.base_quantity || 0)),
            takerIsBid: Boolean(json.taker_is_bid ?? json.is_bid),
            makerBalanceManagerId: String(json.maker_balance_manager_id || ''),
            takerBalanceManagerId: String(json.taker_balance_manager_id || ''),
            timestamp,
            txDigest,
          };
          return { type: 'OrderFilled', data };
        }

        case 'OrderPlaced': {
          const data: OrderPlacedEvent = {
            balanceManagerId: String(json.balance_manager_id || ''),
            poolId: String(json.pool_id || ''),
            orderId: String(json.order_id || ''),
            price: BigInt(String(json.price || 0)),
            quantity: BigInt(String(json.placed_quantity || json.quantity || 0)),
            isBid: Boolean(json.is_bid),
            timestamp,
            txDigest,
          };
          return { type: 'OrderPlaced', data };
        }

        case 'OrderCanceled': {
          const data: OrderCanceledEvent = {
            balanceManagerId: String(json.balance_manager_id || ''),
            poolId: String(json.pool_id || ''),
            orderId: String(json.order_id || ''),
            price: BigInt(String(json.price || 0)),
            quantity: BigInt(String(json.original_quantity || 0)),
            isBid: Boolean(json.is_bid),
            timestamp,
            txDigest,
          };
          return { type: 'OrderCanceled', data };
        }

        default:
          return null;
      }
    } catch (error) {
      console.warn('[EventService] Event parsing error:', error);
      return null;
    }
  }

  /**
   * Notify all subscribers of an event
   */
  private notifySubscribers(event: DeepBookEvent): void {
    const subscribers = this.subscribers.get(event.type);
    if (subscribers) {
      subscribers.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error('[EventService] Subscriber callback error:', error);
        }
      });
    }
  }
}
