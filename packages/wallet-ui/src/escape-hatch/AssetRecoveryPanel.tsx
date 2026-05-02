/**
 * AssetRecoveryPanel
 *
 * Generic recovery UI. Renders RecoverableItem cards from a list of adapters.
 * No Sui SDK dependency — adapters do all chain work.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RecoverableItem, RecoveryAction, RecoveryAdapter, RecoverySimulation } from './types';

interface AssetRecoveryPanelProps {
  adapters: RecoveryAdapter[];
  address: string | null;
}

interface AdapterState {
  adapter: RecoveryAdapter;
  items: RecoverableItem[];
  loading: boolean;
  error: string | null;
}

interface ActionState {
  running: boolean;
  digest: string | null;
  error: string | null;
}

interface ConfirmState {
  item: RecoverableItem;
  action: RecoveryAction;
  simulation: RecoverySimulation | null;
  simulating: boolean;
}

function formatBalance(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return whole.toString();
  const fracStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export function AssetRecoveryPanel({ adapters, address }: AssetRecoveryPanelProps) {
  const [states, setStates] = useState<AdapterState[]>([]);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Use a ref to access the latest adapters without making them a useEffect
  // dependency. Adapters from the host app are usually recreated each render
  // (closure over auth state); rerunning discover on every render would hammer
  // RPC. We deliberately re-discover only when `address` changes.
  const adaptersRef = useRef(adapters);
  adaptersRef.current = adapters;

  useEffect(() => {
    if (!address) {
      setStates([]);
      return;
    }
    let cancelled = false;
    const currentAdapters = adaptersRef.current;
    const initial = currentAdapters.map(a => ({ adapter: a, items: [], loading: true, error: null }));
    setStates(initial);
    currentAdapters.forEach((adapter, idx) => {
      adapter.discover(address)
        .then(items => {
          if (cancelled) return;
          setStates(prev => prev.map((s, i) => i === idx ? { ...s, items, loading: false } : s));
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          setStates(prev => prev.map((s, i) => i === idx ? { ...s, loading: false, error: msg } : s));
        });
    });
    return () => { cancelled = true; };
  }, [address]);

  const runAction = useCallback(async (item: RecoverableItem, action: RecoveryAction) => {
    const key = `${item.id}::${action.label}`;
    setActionStates(s => ({ ...s, [key]: { running: true, digest: null, error: null } }));
    try {
      const { digest } = await action.execute();
      setActionStates(s => ({ ...s, [key]: { running: false, digest, error: null } }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionStates(s => ({ ...s, [key]: { running: false, digest: null, error: msg } }));
    }
  }, []);

  const handleClickAction = useCallback(async (item: RecoverableItem, action: RecoveryAction) => {
    if (action.disabled) return;
    if (!action.destructive) {
      runAction(item, action);
      return;
    }
    const initial: ConfirmState = { item, action, simulation: null, simulating: !!action.simulate };
    setConfirm(initial);
    if (action.simulate) {
      try {
        const sim = await action.simulate();
        setConfirm(c => c && c.action === action ? { ...c, simulation: sim, simulating: false } : c);
      } catch {
        setConfirm(c => c && c.action === action ? { ...c, simulation: null, simulating: false } : c);
      }
    }
  }, [runAction]);

  if (!address) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-zinc-700 p-6 text-center text-gray-600 dark:text-zinc-400 text-sm">
        Connect your wallet to discover recoverable assets.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {states.map((s, i) => (
        <AdapterSection
          key={i}
          state={s}
          actionStates={actionStates}
          onAction={handleClickAction}
        />
      ))}
      {states.length > 0 && states.every(s => !s.loading && s.items.length === 0 && !s.error) && (
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 p-6 text-center text-gray-600 dark:text-zinc-400 text-sm">
          Nothing to recover. Your wallet is clean.
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            runAction(c.item, c.action);
          }}
        />
      )}
    </div>
  );
}

function AdapterSection({
  state,
  actionStates,
  onAction,
}: {
  state: AdapterState;
  actionStates: Record<string, ActionState>;
  onAction: (item: RecoverableItem, action: RecoveryAction) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
        {state.adapter.productName}
      </h3>
      {state.loading && (
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 p-4 text-sm text-gray-500 dark:text-zinc-400">
          Discovering on-chain assets...
        </div>
      )}
      {state.error && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load: {state.error}
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 p-4 text-sm text-gray-500 dark:text-zinc-400">
          No items found.
        </div>
      )}
      {state.items.map(item => (
        <ItemCard key={item.id} item={item} actionStates={actionStates} onAction={onAction} />
      ))}
    </div>
  );
}

function ItemCard({
  item,
  actionStates,
  onAction,
}: {
  item: RecoverableItem;
  actionStates: Record<string, ActionState>;
  onAction: (item: RecoverableItem, action: RecoveryAction) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-3">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">{item.label}</div>
        <div className="text-xs text-gray-500 dark:text-zinc-400 font-mono break-all">{item.id}</div>
      </div>
      {item.balances && item.balances.length > 0 && (
        <div className="space-y-1 text-sm">
          {item.balances.map((b, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-gray-600 dark:text-zinc-400">{b.token}</span>
              <span className="tabular-nums text-gray-900 dark:text-zinc-100">
                {formatBalance(b.amount, b.decimals)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {item.actions.map((action, i) => {
          const key = `${item.id}::${action.label}`;
          const st = actionStates[key];
          return (
            <div key={i} className="flex flex-col gap-1">
              <button
                onClick={() => onAction(item, action)}
                disabled={action.disabled || st?.running}
                title={action.disabledReason}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  action.disabled
                    ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed'
                    : action.destructive
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                } ${st?.running ? 'opacity-60 cursor-wait' : ''}`}
              >
                {st?.running ? 'Running...' : action.label}
              </button>
              {action.disabled && action.disabledReason && (
                <span className="text-xs text-gray-500 dark:text-zinc-500">{action.disabledReason}</span>
              )}
              {st?.digest && (
                <span className="text-xs text-green-700 dark:text-green-400 font-mono break-all">
                  Tx: {st.digest.slice(0, 12)}...
                </span>
              )}
              {st?.error && (
                <span className="text-xs text-red-700 dark:text-red-400 break-words">
                  {st.error}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-lg max-w-md w-full p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
          Confirm: {state.action.label}
        </h3>
        <div className="text-sm text-gray-700 dark:text-zinc-300">
          <div className="mb-2">
            <span className="font-medium">{state.item.label}</span>
          </div>
          {state.simulating && (
            <div className="text-gray-500 dark:text-zinc-400">Simulating...</div>
          )}
          {state.simulation && (
            <div className="rounded bg-gray-50 dark:bg-zinc-900 p-3 space-y-1 text-xs">
              <div className="font-medium text-gray-900 dark:text-zinc-100">
                {state.simulation.summary}
              </div>
              {state.simulation.details && Object.entries(state.simulation.details).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">{k}</span>
                  <span className="tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
