/**
 * TP/SL Order Storage
 *
 * JSON file-based storage for server-side TP/SL orders.
 * Supports CRUD operations with atomic status transitions.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type OrderSide = 'buy' | 'sell';
export type TriggerType = 'take_profit' | 'stop_loss';
export type OrderStatus = 'active' | 'executing' | 'filled' | 'canceled' | 'failed';

// Cap how many transient failures we tolerate before promoting an order to permanent
// 'failed'. Without this, owned-object version-mismatch races (e.g. keeper's own gas coin
// stuck behind a stale ref) can pin a single order in retry-forever loops — observed
// 2,700+ retries per order over 5 days in the 2026-05-22 incident.
export const MAX_TRANSIENT_FAILURES = 50;

export interface TPSLOrder {
  id: string;
  userAddress: string;
  poolId: string;
  marketSymbol: string;
  side: OrderSide;
  triggerType: TriggerType;
  triggerPrice: number;
  quantity: number;
  tradeCapId: string;
  balanceManagerId: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  txDigest?: string;
  error?: string;
  consecutiveFailures?: number;
  lastFailureReason?: string;
  lastFailureAt?: number;
}

interface StoreData {
  orders: TPSLOrder[];
  version: number;
}

const DEFAULT_DATA: StoreData = { orders: [], version: 1 };

export class TPSLStore {
  private filePath: string;
  private data: StoreData;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (error) {
      console.warn(`[tpsl-store] Failed to load ${this.filePath}, using defaults`);
    }
    return { ...DEFAULT_DATA };
  }

  /**
   * Atomic write: write to temp file, then rename.
   * rename() is atomic on POSIX filesystems, preventing data corruption on crash.
   */
  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.data, null, 2));
    renameSync(tmpPath, this.filePath);
  }

  // Create a new TP/SL order
  create(order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt' | 'updatedAt'>): TPSLOrder {
    const now = Date.now();
    const newOrder: TPSLOrder = {
      ...order,
      id: `tpsl-${randomUUID()}`,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.data.orders.push(newOrder);
    this.save();
    return newOrder;
  }

  // Get all active orders
  getActive(): TPSLOrder[] {
    return this.data.orders.filter((o) => o.status === 'active');
  }

  // Get orders for a specific user
  getByUser(userAddress: string): TPSLOrder[] {
    return this.data.orders.filter(
      (o) => o.userAddress === userAddress && (o.status === 'active' || o.status === 'executing')
    );
  }

  // Get order by ID
  getById(id: string): TPSLOrder | null {
    return this.data.orders.find((o) => o.id === id) ?? null;
  }

  // Atomically claim an order for execution (active -> executing)
  claim(id: string): TPSLOrder | null {
    const order = this.data.orders.find((o) => o.id === id && o.status === 'active');
    if (!order) return null;

    order.status = 'executing';
    order.updatedAt = Date.now();
    this.save();
    return order;
  }

  // Mark order as filled
  markFilled(id: string, txDigest: string): void {
    const order = this.data.orders.find((o) => o.id === id);
    if (!order) return;

    order.status = 'filled';
    order.txDigest = txDigest;
    order.updatedAt = Date.now();
    order.consecutiveFailures = 0;
    this.save();
  }

  // Mark order as failed. Permanent failures go to 'failed' immediately. Transient
  // failures bump a counter and return to 'active'; if the counter hits
  // MAX_TRANSIENT_FAILURES the order is promoted to 'failed' (caller fires alert).
  markFailed(id: string, error: string, permanent = false): { promoted: boolean } {
    const order = this.data.orders.find((o) => o.id === id);
    if (!order) return { promoted: false };

    const now = Date.now();
    order.error = error;
    order.lastFailureReason = error;
    order.lastFailureAt = now;
    order.updatedAt = now;

    if (permanent) {
      order.status = 'failed';
      this.save();
      return { promoted: false };
    }

    order.consecutiveFailures = (order.consecutiveFailures ?? 0) + 1;
    if (order.consecutiveFailures >= MAX_TRANSIENT_FAILURES) {
      order.status = 'failed';
      this.save();
      return { promoted: true };
    }

    order.status = 'active';
    this.save();
    return { promoted: false };
  }

  // Cancel an order
  cancel(id: string): boolean {
    const order = this.data.orders.find(
      (o) => o.id === id && (o.status === 'active' || o.status === 'executing')
    );
    if (!order) return false;

    order.status = 'canceled';
    order.updatedAt = Date.now();
    this.save();
    return true;
  }

  // Prune old completed orders (> maxAgeMs, default 7 days)
  prune(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.data.orders.length;
    this.data.orders = this.data.orders.filter(
      (o) => o.status === 'active' || o.status === 'executing' || o.updatedAt > cutoff
    );
    if (this.data.orders.length < before) {
      this.save();
    }
  }

  // Get stats
  stats(): { total: number; active: number; filled: number; failed: number } {
    const orders = this.data.orders;
    return {
      total: orders.length,
      active: orders.filter((o) => o.status === 'active').length,
      filled: orders.filter((o) => o.status === 'filled').length,
      failed: orders.filter((o) => o.status === 'failed').length,
    };
  }
}
