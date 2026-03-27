/**
 * MobileQuickActions
 * Horizontal scrolling icon strip for mobile quick actions.
 * Compact: icon + label only (no descriptions).
 * Benchmarked from Binance/Coinbase mobile action strips.
 */

import { Link } from 'react-router-dom';

interface QuickAction {
  label: string;
  path: string;
  icon: React.ReactNode;
  color: string;
}

const ACTIONS: QuickAction[] = [
  {
    label: 'Lottery',
    path: '/leisure/lottery',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    ),
    color: 'text-yellow-500',
  },
  {
    label: 'Spot',
    path: '/markets/spot',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    color: 'text-pd3',
  },
  {
    label: 'Predict',
    path: '/predict',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'text-indigo-500',
  },
  {
    label: 'Perp',
    path: '/markets/perp',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: 'text-purple-500',
  },
  {
    label: 'Earn',
    path: '/earn',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-green-500',
  },
  {
    label: 'Send',
    path: '/wallet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    color: 'text-cyan-500',
  },
];

export function MobileQuickActions() {
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
      {ACTIONS.map((action) => (
        <Link
          key={action.label}
          to={action.path}
          className="flex flex-col items-center gap-1 shrink-0 min-w-[52px]"
        >
          <div className="w-10 h-10 rounded-full bg-theme-bg-secondary flex items-center justify-center">
            <span className={action.color}>{action.icon}</span>
          </div>
          <span className="text-[10px] font-medium text-theme-text-secondary">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
