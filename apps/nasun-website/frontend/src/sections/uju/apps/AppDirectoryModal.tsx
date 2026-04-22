import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  APP_REGISTRY,
  CHAIN_LABEL,
  CHAIN_BADGE_CLASS,
  type AppChain,
  type AppEntry,
} from './appRegistry';
import { MAX_PINNED } from './useAppDirectory';

// --- Icons ---

function XIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// --- Chain filter tabs ---

const CHAIN_FILTERS: Array<{ value: AppChain | 'all'; label: string }> = [
  { value: 'all',      label: 'All' },
  { value: 'nasun',    label: 'Nasun' },
  { value: 'solana',   label: 'Solana' },
  { value: 'sui',      label: 'SUI' },
  { value: 'ethereum', label: 'Ethereum' },
];

// --- App card ---

function AppCard({
  app,
  pinned,
  atMax,
  onPin,
  onUnpin,
}: {
  app: AppEntry;
  pinned: boolean;
  atMax: boolean;
  onPin: () => void;
  onUnpin: () => void;
}) {
  const isComingSoon = app.status === 'coming-soon';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      isComingSoon ? 'border-uju-border/50' : 'border-uju-border hover:border-uju-secondary/40'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isComingSoon ? 'text-uju-secondary bg-uju-border/30' : CHAIN_BADGE_CLASS[app.chain]}`}>
            {CHAIN_LABEL[app.chain]}
          </span>
          <span className={`text-sm font-semibold truncate ${isComingSoon ? 'text-uju-secondary' : 'text-uju-primary'}`}>{app.name}</span>
          {isComingSoon && (
            <span className="text-xs text-uju-secondary border border-uju-border rounded px-1.5 py-0.5 shrink-0">
              Soon
            </span>
          )}
        </div>
        <p className="text-sm text-uju-secondary leading-snug">{app.description}</p>
      </div>

      {!isComingSoon && (
        <div className="flex items-center gap-2 shrink-0">
          {pinned ? (
            <button
              onClick={onUnpin}
              className="flex items-center gap-1 text-sm font-medium text-pado-4 border border-pado-4/30 rounded px-2 py-1 hover:bg-pado-4/10 transition-colors"
            >
              <CheckIcon />
              Pinned
            </button>
          ) : (
            <button
              onClick={onPin}
              disabled={atMax}
              title={atMax ? `Max ${MAX_PINNED} apps` : undefined}
              className="text-sm font-medium text-uju-secondary border border-uju-border rounded px-2 py-1 hover:text-pado-3 hover:border-pado-3/40 transition-colors disabled:text-uju-border disabled:border-uju-border/50 disabled:cursor-not-allowed disabled:hover:text-uju-border disabled:hover:border-uju-border/50"
            >
              Pin
            </button>
          )}
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${app.name}, opens in new tab`}
            className="text-sm font-medium text-pado-3 border border-pado-3/30 rounded px-2 py-1 hover:bg-pado-3/10 transition-colors"
          >
            Open
          </a>
        </div>
      )}
    </div>
  );
}

// --- Modal ---

export interface AppDirectoryModalProps {
  open: boolean;
  onClose: () => void;
  isPinned: (id: string) => boolean;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  atMax: boolean;
}

export function AppDirectoryModal({
  open,
  onClose,
  isPinned,
  pin,
  unpin,
  atMax,
}: AppDirectoryModalProps) {
  const [activeChain, setActiveChain] = useState<AppChain | 'all'>('all');

  // Reset chain filter when modal reopens
  useEffect(() => {
    if (open) setActiveChain('all');
  }, [open]);

  const filtered = activeChain === 'all'
    ? APP_REGISTRY
    : APP_REGISTRY.filter((a) => a.chain === activeChain);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 bg-uju-card border border-uju-border rounded-xl shadow-xl flex flex-col max-h-[90vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"

        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-uju-border shrink-0">
            <Dialog.Title className="text-base font-semibold text-uju-primary">
              App Directory
            </Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              className="text-uju-secondary hover:text-uju-primary transition-colors"
              aria-label="Close"
            >
              <XIcon />
            </Dialog.Close>
          </div>

          {/* Chain filter tabs */}
          <div className="flex gap-1 px-5 py-3 border-b border-uju-border shrink-0 overflow-x-auto">
            {CHAIN_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setActiveChain(f.value)}
                className={`shrink-0 px-3 py-1 text-sm rounded-full border transition-colors ${
                  activeChain === f.value
                    ? 'text-pado-3 border-pado-3/40 bg-pado-3/10'
                    : 'text-uju-secondary border-uju-border hover:text-uju-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* App list */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {filtered.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                pinned={isPinned(app.id)}
                atMax={atMax}
                onPin={() => pin(app.id)}
                onUnpin={() => unpin(app.id)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-uju-border shrink-0">
            <p className="text-sm text-uju-secondary">
              {filtered.length} app{filtered.length !== 1 ? 's' : ''} shown
              {atMax && (
                <span className="ml-2 text-nasun-c1">
                  - Max {MAX_PINNED} pinned
                </span>
              )}
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
