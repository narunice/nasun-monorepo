/**
 * DeepBook V3 Event Types
 */

// Order filled event (trade execution)
export interface OrderFilledEvent {
  poolId: string;
  orderId: string;
  price: bigint;
  quantity: bigint;
  takerIsBid: boolean;
  timestamp: number;
  txDigest: string;
}

// Order placed event
export interface OrderPlacedEvent {
  poolId: string;
  orderId: string;
  owner: string;
  price: bigint;
  quantity: bigint;
  isBid: boolean;
  timestamp: number;
  txDigest: string;
}

// Order canceled event
export interface OrderCanceledEvent {
  poolId: string;
  orderId: string;
  timestamp: number;
  txDigest: string;
}

// Union type for all events
export type DeepBookEvent =
  | { type: 'OrderFilled'; data: OrderFilledEvent }
  | { type: 'OrderPlaced'; data: OrderPlacedEvent }
  | { type: 'OrderCanceled'; data: OrderCanceledEvent };

// Event callback type
export type EventCallback<T = DeepBookEvent> = (event: T) => void;

// Connection mode
export type ConnectionMode = 'websocket' | 'polling' | 'simulation';

// Event type names
export type EventType = 'OrderFilled' | 'OrderPlaced' | 'OrderCanceled';
