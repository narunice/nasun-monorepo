/**
 * Core event decoder — parses SuiEvent into DecodedEvent.
 */
import type { SuiEvent } from '@mysten/sui/client';
import type { DecodedEvent, DecodedField, FieldType } from './types';
import { findEventGroup } from './registries';
import {
  formatBalance,
  formatTokenBalance,
  truncateAddress,
  formatTimestamp,
} from '../format';

// Max array elements to process (prevents DoS from malicious on-chain data)
const MAX_ARRAY_ELEMENTS = 4096;

// Parse event type string: `{packageId}::{module}::{EventName}<...>`
// Strips generic type parameters safely.
function parseEventType(type: string): { packageId: string; module: string; eventName: string } | null {
  // Strip generic parameters: SwapEvent<0x...::nbtc::NBTC> → SwapEvent
  const cleanType = type.replace(/<.*>$/, '');
  const firstSep = cleanType.indexOf('::');
  if (firstSep === -1) return null;

  const packageId = cleanType.slice(0, firstSep);
  const rest = cleanType.slice(firstSep + 2);
  const secondSep = rest.indexOf('::');
  if (secondSep === -1) return null;

  return {
    packageId,
    module: rest.slice(0, secondSep),
    eventName: rest.slice(secondSep + 2),
  };
}

// Format a single field value based on its type
function formatFieldValue(
  rawValue: unknown,
  type: FieldType,
): { formatted: string; link?: string } {
  const strValue = String(rawValue ?? '');

  switch (type) {
    case 'address':
      return {
        formatted: truncateAddress(strValue),
        link: `/address/${strValue}`,
      };

    case 'object_id':
      return {
        formatted: truncateAddress(strValue),
        link: `/object/${strValue}`,
      };

    case 'nasun_amount':
      try {
        return { formatted: `${formatBalance(BigInt(strValue).toString())} NSN` };
      } catch {
        return { formatted: `${strValue} SOE` };
      }

    case 'nusdc_amount':
      try {
        return { formatted: `${formatTokenBalance(BigInt(strValue).toString(), '::nusdc::')} NUSDC` };
      } catch {
        return { formatted: strValue };
      }

    case 'nbtc_amount':
      try {
        return { formatted: `${formatTokenBalance(BigInt(strValue).toString(), '::nbtc::')} NBTC` };
      } catch {
        return { formatted: strValue };
      }

    case 'timestamp_ms':
      return { formatted: formatTimestamp(strValue) };

    case 'boolean':
      if (typeof rawValue === 'boolean') {
        return { formatted: rawValue ? 'Yes' : 'No' };
      }
      return { formatted: strValue === 'true' ? 'Yes' : 'No' };

    case 'number':
      try {
        return { formatted: BigInt(strValue).toLocaleString('en-US') };
      } catch {
        return { formatted: strValue };
      }

    case 'numbers_array':
      if (Array.isArray(rawValue)) {
        const capped = rawValue.length > MAX_ARRAY_ELEMENTS ? rawValue.slice(0, MAX_ARRAY_ELEMENTS) : rawValue;
        const suffix = rawValue.length > MAX_ARRAY_ELEMENTS ? ', ...' : '';
        return { formatted: capped.join(', ') + suffix };
      }
      return { formatted: strValue };

    case 'hash':
      if (Array.isArray(rawValue)) {
        // Move vector<u8> comes as number array — cap to prevent DoS
        const capped = rawValue.length > MAX_ARRAY_ELEMENTS ? rawValue.slice(0, MAX_ARRAY_ELEMENTS) : rawValue;
        const hex = capped.map((b: number) => b.toString(16).padStart(2, '0')).join('');
        return { formatted: `0x${hex.slice(0, 12)}...${hex.slice(-8)}` };
      }
      if (strValue.length > 30) {
        return { formatted: `${strValue.slice(0, 14)}...${strValue.slice(-8)}` };
      }
      return { formatted: strValue };

    case 'string':
      // Move vector<u8> strings come as number arrays from parsedJson
      if (Array.isArray(rawValue)) {
        const capped = rawValue.length > MAX_ARRAY_ELEMENTS ? rawValue.slice(0, MAX_ARRAY_ELEMENTS) : rawValue;
        const suffix = rawValue.length > MAX_ARRAY_ELEMENTS ? '...' : '';
        try {
          const decoded = String.fromCharCode(...(capped as number[]));
          return { formatted: (decoded || '-') + suffix };
        } catch {
          return { formatted: capped.join(', ') + suffix };
        }
      }
      return { formatted: strValue || '-' };

    default:
      return { formatted: strValue || '-' };
  }
}

/**
 * Decode a single SuiEvent into a structured DecodedEvent.
 * Returns null if the event is not recognized.
 */
export function decodeEvent(event: SuiEvent): DecodedEvent | null {
  const parsed = parseEventType(event.type);
  if (!parsed) return null;

  const group = findEventGroup(parsed.packageId, parsed.module);
  if (!group) return null;

  const eventDef = group.events[parsed.eventName];
  if (!eventDef) return null;

  const data = event.parsedJson as Record<string, unknown> | null | undefined;
  if (!data) return null;

  const fields: DecodedField[] = eventDef.fields.map((fieldDef) => {
    const rawValue = data[fieldDef.key];
    const { formatted, link } = formatFieldValue(rawValue, fieldDef.type);
    return {
      label: fieldDef.label,
      value: rawValue !== undefined && rawValue !== null ? String(rawValue) : '-',
      type: fieldDef.type,
      formattedValue: formatted,
      link,
    };
  });

  return {
    protocol: group.name,
    badgeVariant: group.badgeVariant,
    eventName: eventDef.label,
    description: eventDef.description,
    fields,
    raw: event.parsedJson,
  };
}
