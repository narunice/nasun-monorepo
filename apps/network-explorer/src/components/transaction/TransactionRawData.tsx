import { useMemo } from 'react';
import { SectionBox } from '../ui/SectionBox';
import { useCopyToClipboard } from '../../hooks';

interface TransactionRawDataProps {
  data: unknown;
}

export default function TransactionRawData({ data }: TransactionRawDataProps) {
  const { copied, handleCopy } = useCopyToClipboard();
  const jsonString = useMemo(() => JSON.stringify(data, null, 2), [data]);

  return (
    <SectionBox title="Raw Transaction Data" color="c6">
      <div className="relative">
        <button
          onClick={() => handleCopy(jsonString)}
          aria-label="Copy raw transaction data"
          className="absolute top-2 right-4 z-10 px-3 py-1.5 mr-2 text-xs font-medium rounded-md transition-all duration-200 bg-secondary/20 hover:bg-secondary/40 text-foreground border border-border"
        >
          {copied ? (
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <pre className="text-xs overflow-auto bg-muted/50 border border-border pt-12 pb-4 px-4 rounded-lg max-h-96 text-foreground custom-scrollbar">
          {jsonString}
        </pre>
      </div>
    </SectionBox>
  );
}
