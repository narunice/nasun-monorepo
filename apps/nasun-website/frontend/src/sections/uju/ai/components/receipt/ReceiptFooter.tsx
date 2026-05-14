interface ReceiptFooterProps {
  explorerUrl?: string;
  onClose: () => void;
}

export function ReceiptFooter({ explorerUrl, onClose }: ReceiptFooterProps) {
  return (
    <div className="border-t border-uju-border/60 pt-4 mt-4 flex items-center justify-between">
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-pado-2 hover:text-pado-3 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          View on Explorer
        </a>
      )}
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-uju-secondary hover:text-white transition-colors px-3 py-1 rounded border border-uju-border/60"
      >
        Close
      </button>
    </div>
  );
}
