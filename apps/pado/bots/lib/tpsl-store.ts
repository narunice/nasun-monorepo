/**
 * TP/SL Order Storage
 *
 * JSON file-based storage for server-side TP/SL orders.
 * Supports CRUD operations with atomic status transitions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type OrderSide = 'buy' | 'sell';
export type TriggerType = 'take_profit' | 'stop_loss';
export type OrderStatus = 'active' | 'executing' | 'filled' | 'canceled' | 'failed';

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

  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
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
    this.save();
  }

  // Mark order as failed (back to active for retry, or failed permanently)
  markFailed(id: string, error: string, permanent = false): void {
    const order = this.data.orders.find((o) => o.id === id);
    if (!order) return;

    order.status = permanent ? 'failed' : 'active';
    order.error = error;
    order.updatedAt = Date.now();
    this.save();
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
