import { useState } from 'react';
import { Link } from 'react-router-dom';

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  status?: string;
  link?: string;
}

export default function InfoRow({ label, value, mono, copyable, status, link }: InfoRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-nasun-white/10 last:border-b-0">
      <div className="w-40 text-nasun-white/60 text-sm font-medium flex-shrink-0 mb-1 sm:mb-0">
        {label}
      </div>
      <div className={`flex-1 break-all flex items-center gap-2 ${mono ? 'font-mono text-sm' : 'text-sm md:text-base'}`}>
        {status ? (
          <span
            className={`px-2 py-0.5 rounded-sm text-xs font-semibold uppercase tracking-wider ${
              status === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-nasun-scarlet/10 text-nasun-scarlet border border-nasun-scarlet/20'
            }`}
          >
            {value}
          </span>
        ) : link ? (
          <Link to={link} className="text-nasun-c4 hover:text-nasun-c4/80 hover:underline transition-colors">
            {value}
          </Link>
        ) : (
          <span className="text-nasun-white/90">{value}</span>
        )}
        
        {copyable && (
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="p-1 rounded-sm text-nasun-white/40 hover:text-nasun-white hover:bg-nasun-white/10 transition-all"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}