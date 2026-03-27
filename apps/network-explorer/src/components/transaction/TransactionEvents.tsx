import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { Badge } from '../ui/Badge';
import { formatObjectType, sanitizeJsonForDisplay } from '../../lib/format';
import { decodeEvent } from '../../lib/event-decoder';
import type { DecodedEvent, DecodedField } from '../../lib/event-decoder';
import { useCopyToClipboard } from '../../hooks';
import type { SuiEvent } from '@mysten/sui/client';

interface TransactionEventsProps {
  events: SuiEvent[] | null | undefined;
}

export default function TransactionEvents({ events }: TransactionEventsProps) {
  if (!events || events.length === 0) return null;

  return (
    <SectionBox title={`Events (${events.length})`} color="c4">
      <div className="space-y-2">
        {events.map((event, idx) => (
          <EventCard key={idx} event={event} />
        ))}
      </div>
    </SectionBox>
  );
}

function EventCard({ event }: { event: SuiEvent }) {
  // Per-event try-catch: decoding failure only affects this card
  const decoded = useMemo<DecodedEvent | null>(() => {
    try {
      return decodeEvent(event);
    } catch {
      return null;
    }
  }, [event]);

  if (decoded) {
    return <DecodedEventCard decoded={decoded} data={event.parsedJson} />;
  }

  return <RawEventCard type={event.type} data={event.parsedJson} />;
}

// Decoded event: protocol badge + structured fields + collapsible raw JSON
function DecodedEventCard({ decoded, data }: { decoded: DecodedEvent; data: unknown }) {
  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3">
      {/* Header: protocol badge + event name */}
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={decoded.badgeVariant}>{decoded.protocol}</Badge>
        <span className="text-sm font-medium text-foreground">{decoded.eventName}</span>
      </div>

      {/* Structured fields */}
      <div className="space-y-0">
        {decoded.fields.map((field, idx) => (
          <DecodedFieldRow key={idx} field={field} />
        ))}
      </div>

      {/* Collapsible raw JSON */}
      <CollapsibleRawJson data={data} />
    </div>
  );
}

// Single decoded field row — mirrors InfoRow pattern
function DecodedFieldRow({ field }: { field: DecodedField }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-1.5 border-b border-border/50 last:border-b-0">
      <div className="w-36 text-muted-foreground text-xs font-medium flex-shrink-0 mb-0.5 sm:mb-0">
        {field.label}
      </div>
      <div className="flex-1 break-all text-sm">
        {field.link ? (
          <Link
            to={field.link}
            className="text-primary hover:text-primary/80 hover:underline transition-colors font-mono text-xs"
          >
            {field.formattedValue}
          </Link>
        ) : (
          <span className="text-foreground font-mono text-xs">{field.formattedValue}</span>
        )}
      </div>
    </div>
  );
}

// Raw event card (for unknown events — unchanged from original)
function RawEventCard({ type, data }: { type: string; data: unknown }) {
  const { copied, handleCopy } = useCopyToClipboard();
  const jsonString = useMemo(() => JSON.stringify(sanitizeJsonForDisplay(data), null, 2), [data]);

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm text-muted-foreground">{formatObjectType(type)}</div>
        <button
          onClick={() => handleCopy(jsonString)}
          aria-label="Copy event data"
          className="px-2 py-1 text-xs font-medium rounded transition-all duration-200 bg-secondary/20 hover:bg-secondary/40 text-foreground"
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy
            </span>
          )}
        </button>
      </div>
      <pre className="text-xs overflow-auto bg-muted/50 p-2 rounded text-foreground custom-scrollbar max-h-48">
        {jsonString}
      </pre>
    </div>
  );
}

// Collapsible raw JSON toggle
function CollapsibleRawJson({ data }: { data: unknown }) {
  const [isOpen, setIsOpen] = useState(false);
  const { copied, handleCopy } = useCopyToClipboard();
  const jsonString = useMemo(() => JSON.stringify(sanitizeJsonForDisplay(data), null, 2), [data]);

  return (
    <div className="mt-2 pt-2 border-t border-border/30">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="px-2 py-0.5 text-xs font-medium rounded bg-secondary/20 hover:bg-secondary/40 text-muted-foreground transition-colors"
        >
          Raw JSON
        </button>
        {isOpen && (
          <button
            onClick={() => handleCopy(jsonString)}
            aria-label="Copy raw JSON"
            className="px-2 py-0.5 text-xs font-medium rounded bg-secondary/20 hover:bg-secondary/40 text-foreground transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {isOpen && (
        <pre className="mt-1 text-xs overflow-auto bg-muted/50 p-2 rounded text-foreground custom-scrollbar max-h-48">
          {jsonString}
        </pre>
      )}
    </div>
  );
}
