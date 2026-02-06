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
export class EventService {
  private mode: ConnectionMode = 'simulation';
  private subscribers: Map<EventType, Set<EventCallback>> = new Map();
  private pollingCursor: { txDigest: string; eventSeq: string } | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private isConnecting = false;
  private poolFilter: string | null = null;

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
      // Try WebSocket first
      const wsSuccess = await this.tryWebSocket();
      if (wsSuccess) {
        this.mode = 'websocket';
        console.log('[EventService] Connected via WebSocket');
        this.isConnecting = false;
        return this.mode;
      }

      // Fall back to polling
      const pollingSuccess = await this.tryPolling();
      if (pollingSuccess) {
        this.mode = 'polling';
        console.log('[EventService] Connected via Polling (2s interval)');
        this.isConnecting = false;
        return this.mode;
      }

      // Fall back to simulation
      this.mode = 'simulation';
      console.log('[EventService] Running in Simulation mode');
    } catch (error) {
      console.warn('[EventService] Connection error, falling back to simulation:', error);
      this.mode = 'simulation';
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
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.mode = 'simulation';
    this.pollingCursor = null;
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
   * Try WebSocket connection
   */
  private async tryWebSocket(): Promise<boolean> {
    const client = getSuiClient();
    const deepbookPackage = NETWORK_CONFIG.deepbookPackage;

    if (!deepbookPackage) {
      console.warn('[EventService] DeepBook package not configured');
      return false;
    }

    try {
      // Subscribe to OrderFilled events
      const unsubscribe = await client.subscribeEvent({
        filter: {
          MoveEventType: `${deepbookPackage}::pool::OrderFilled`,
        },
        onMessage: (event) => {
          this.handleWebSocketEvent('OrderFilled', event);
        },
      });

      this.wsUnsubscribe = unsubscribe;
      return true;
    } catch (error) {
      console.warn('[EventService] WebSocket subscription failed:', error);
      return false;
    }
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
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.pollEvents();
    }, POLLING_INTERVAL);
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

      // Process events
      for (const event of result.data) {
        this.handlePolledEvent('OrderFilled', event);
      }
    } catch (error) {
      console.warn('[EventService] Polling error:', error);
    }
  }

  /**
   * Handle WebSocket event
   */
  private handleWebSocketEvent(type: EventType, event: unknown): void {
    const parsedEvent = this.parseEvent(type, event);
    if (parsedEvent) {
      this.notifySubscribers(parsedEvent);
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
