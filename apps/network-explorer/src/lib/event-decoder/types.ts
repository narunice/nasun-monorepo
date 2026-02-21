/**
 * Event decoder type definitions for protocol event parsing.
 */

import type { BadgeVariant } from '../../components/ui/Badge';

// Field types supported by the decoder
export type FieldType =
  | 'address'
  | 'object_id'
  | 'nasun_amount'  // 9 decimals (NSN / SOE)
  | 'nusdc_amount'  // 6 decimals
  | 'nbtc_amount'   // 8 decimals
  | 'timestamp_ms'
  | 'boolean'
  | 'number'
  | 'string'
  | 'numbers_array'
  | 'hash';         // hex bytes display

// Definition of a single field in an event
export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
}

// Definition of a single event type
export interface EventDefinition {
  label: string;
  description: string;
  fields: FieldDefinition[];
}

// A group of events from a protocol module
export interface ProtocolEventGroup {
  name: string;
  badgeVariant: BadgeVariant;
  packageIds: string[];
  module: string;
  events: Record<string, EventDefinition>;
}

// A decoded field with formatted value
export interface DecodedField {
  label: string;
  value: string;
  type: FieldType;
  formattedValue: string;
  // For address/object_id types, provide a link path
  link?: string;
}

// Result of decoding a single event
export interface DecodedEvent {
  protocol: string;
  badgeVariant: BadgeVariant;
  eventName: string;
  description: string;
  fields: DecodedField[];
  raw: unknown;
}
