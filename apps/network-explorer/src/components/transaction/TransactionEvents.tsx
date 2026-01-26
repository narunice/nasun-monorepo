import { useState } from 'react';
import { SectionBox } from '../ui/SectionBox';
import { formatObjectType } from '../../lib/format';
import type { SuiEvent } from '@mysten/sui/client';

interface TransactionEventsProps {
  events: SuiEvent[] | undefined;
}

export default function TransactionEvents({ events }: TransactionEventsProps) {
  if (!events || events.length === 0) return null;

  return (
    <SectionBox title={`Events (${events.length})`} color="c4">
      <div className="space-y-2">
        {events.map((event, idx) => (
          <EventCard key={idx} type={event.type} data={event.parsedJson} />
        ))}
      </div>
    </SectionBox>
  );
}

function EventCard({ type, data }: { type: string; data: unknown }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm text-muted-foreground">{formatObjectType(type)}</div>
        <button
          onClick={handleCopy}
          className="px-2 py-1 text-xs font-medium rounded transition-all duration-200 bg-secondary/20 hover:bg-secondary/40 text-foreground"
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
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
