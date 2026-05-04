/**
 * PadoActivityCard
 *
 * Period-filtered deposit / withdraw activity for the user's Pado balance.
 * Periods: All time, 7D, 30D, 90D, This month, Last month, Custom month.
 */

import { useMemo, useState } from 'react';
import { useMarginActivity } from './useMarginActivity';

type PeriodId = 'all' | '7d' | '30d' | '90d' | 'this-month' | 'last-month' | 'custom-month';

interface PadoActivityCardProps {
  marginAccountId: string | null;
  /** Lifetime totals from the on-chain account; used for "All time" fast path. */
  lifetimeDepositedUsd: number;
  lifetimeWithdrawnUsd: number;
}

const PRESET_PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'custom-month', label: 'Custom month' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
}

function endOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 1, 0, 0, 0, 0).getTime() - 1;
}

function formatYearMonth(value: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (year < 2024 || year > 2100) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

function defaultCustomMonth(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface ResolvedRange {
  fromMs: number | null;
  toMs: number | null;
  /** When true, the card should display lifetime totals from the account object
   *  instead of querying events (used for "All time"). */
  useLifetime: boolean;
}

function resolveRange(period: PeriodId, customMonth: string): ResolvedRange {
  const now = Date.now();
  switch (period) {
    case 'all':
      return { fromMs: null, toMs: null, useLifetime: true };
    case '7d':
      return { fromMs: now - 7 * MS_PER_DAY, toMs: now, useLifetime: false };
    case '30d':
      return { fromMs: now - 30 * MS_PER_DAY, toMs: now, useLifetime: false };
    case '90d':
      return { fromMs: now - 90 * MS_PER_DAY, toMs: now, useLifetime: false };
    case 'this-month': {
      const d = new Date();
      return {
        fromMs: startOfMonth(d.getFullYear(), d.getMonth()),
        toMs: now,
        useLifetime: false,
      };
    }
    case 'last-month': {
      const d = new Date();
      const ym = d.getMonth() === 0
        ? { year: d.getFullYear() - 1, monthIndex: 11 }
        : { year: d.getFullYear(), monthIndex: d.getMonth() - 1 };
      return {
        fromMs: startOfMonth(ym.year, ym.monthIndex),
        toMs: endOfMonth(ym.year, ym.monthIndex),
        useLifetime: false,
      };
    }
    case 'custom-month': {
      const ym = formatYearMonth(customMonth);
      if (!ym) return { fromMs: null, toMs: null, useLifetime: false };
      return {
        fromMs: startOfMonth(ym.year, ym.monthIndex),
        toMs: endOfMonth(ym.year, ym.monthIndex),
        useLifetime: false,
      };
    }
  }
}

export function PadoActivityCard({
  marginAccountId,
  lifetimeDepositedUsd,
  lifetimeWithdrawnUsd,
}: PadoActivityCardProps) {
  const [period, setPeriod] = useState<PeriodId>('all');
  const [customMonth, setCustomMonth] = useState<string>(defaultCustomMonth());

  const range = useMemo(() => resolveRange(period, customMonth), [period, customMonth]);

  const { data, isLoading } = useMarginActivity({
    accountId: marginAccountId,
    fromMs: range.fromMs,
    toMs: range.toMs,
    enabled: !range.useLifetime,
  });

  const deposited = range.useLifetime ? lifetimeDepositedUsd : data?.depositedUsd ?? 0;
  const withdrawn = range.useLifetime ? lifetimeWithdrawnUsd : data?.withdrawnUsd ?? 0;
  const netFlow = deposited - withdrawn;

  const isCustomMonth = period === 'custom-month';
  const ymInvalid = isCustomMonth && !formatYearMonth(customMonth);

  return (
    <div className="border-t border-theme-border pt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="text-sm font-medium text-theme-text-secondary">
          Activity
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_PERIODS.map((p) => {
            const isActive = period === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  isActive
                    ? 'bg-pd2 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {isCustomMonth && (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs text-theme-text-muted">Month</label>
          <input
            type="month"
            value={customMonth}
            onChange={(e) => setCustomMonth(e.target.value)}
            className="px-2 py-1 text-sm bg-theme-bg-primary border border-theme-border rounded-md text-theme-text-primary"
          />
          {ymInvalid && (
            <span className="text-xs text-red-500">Invalid month</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ActivityStat
          label="Deposited"
          value={deposited}
          tone="positive"
          isLoading={!range.useLifetime && isLoading}
        />
        <ActivityStat
          label="Withdrawn"
          value={withdrawn}
          tone="negative"
          isLoading={!range.useLifetime && isLoading}
        />
        <ActivityStat
          label="Net flow"
          value={netFlow}
          tone={netFlow >= 0 ? 'positive' : 'negative'}
          isLoading={!range.useLifetime && isLoading}
        />
      </div>

      {!range.useLifetime && !isLoading && data && !data.hasEvents && (
        <p className="mt-3 text-xs text-theme-text-muted">
          No deposit or withdraw activity in this period.
        </p>
      )}
    </div>
  );
}

interface ActivityStatProps {
  label: string;
  value: number;
  tone: 'positive' | 'negative' | 'neutral';
  isLoading: boolean;
}

function ActivityStat({ label, value, tone, isLoading }: ActivityStatProps) {
  const arrow = label === 'Deposited' ? '↓' : label === 'Withdrawn' ? '↑' : '';
  return (
    <div className="bg-theme-bg-tertiary rounded-lg p-3">
      <div className="text-xs text-theme-text-muted mb-1">
        {arrow && <span className="mr-1">{arrow}</span>}
        {label}
      </div>
      {isLoading ? (
        <div className="h-5 w-24 bg-theme-bg-primary rounded animate-pulse" />
      ) : (
        <div className={`text-base font-semibold ${
          tone === 'positive' ? 'text-green-500' :
          tone === 'negative' ? 'text-red-500' :
          'text-theme-text-primary'
        }`}>
          ${formatUsd(Math.abs(value))}
        </div>
      )}
    </div>
  );
}
