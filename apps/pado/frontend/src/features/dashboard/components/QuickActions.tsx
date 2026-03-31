/**
 * QuickActions
 * Grid of action buttons for common tasks (6 slots - 3x2 grid)
 * Row 1: Spot, Perp, Predict
 * Row 2: Games (3-split), Earn, Send
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAppAdmin } from '../../../hooks/useAppAdmin';

const gated = NETWORK_CONFIG.gamesOnlyMode;

interface ActionItem {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
  tooltip?: string;
  badge?: string;
}

const ACTIONS: ActionItem[] = [
  {
    id: 'spot',
    label: 'Spot',
    description: 'Buy and sell tokens instantly',
    path: '/markets/spot',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    color: 'blue',
    enabled: true,
  },
  {
    id: 'perp',
    label: 'Perp',
    description: 'Trade with up to 20x leverage',
    path: '/markets/perp',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: 'purple',
    enabled: !gated,
  },
  {
    id: 'predict',
    label: 'Predict',
    description: 'Bet on future events',
    path: '/predict',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'indigo',
    enabled: !gated,
  },
  // Games card is rendered separately via GamesCard component (slot 4)
  {
    id: 'earn',
    label: 'Earn',
    description: 'Grow your tokens with interest',
    path: '/earn',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'green',
    enabled: !gated,
  },
  {
    id: 'send',
    label: 'Send',
    description: 'Send tokens to someone',
    path: '/wallet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    color: 'cyan',
    enabled: false,
  },
];

const GAME_ITEMS = [
  {
    label: 'Lottery',
    path: '/games/lottery',
    badge: 'LIVE',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    ),
  },
  {
    label: 'Scratch',
    path: '/games/scratch',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l-1 1m0 0l-2 2m2-2l-2-2m2 2l2 2M3 21h18M5 21V7a2 2 0 012-2h10a2 2 0 012 2v14" />
      </svg>
    ),
  },
  {
    label: 'NumMatch',
    path: '/games/numbermatch',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
  },
];

const COLOR_CLASSES: Record<string, { bg: string; hover: string; icon: string }> = {
  blue: {
    bg: 'bg-pd2/10',
    hover: 'group-hover:bg-pd2/20',
    icon: 'text-pd3',
  },
  green: {
    bg: 'bg-green-500/10',
    hover: 'group-hover:bg-green-500/20',
    icon: 'text-green-500',
  },
  purple: {
    bg: 'bg-purple-500/10',
    hover: 'group-hover:bg-purple-500/20',
    icon: 'text-purple-500',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    hover: 'group-hover:bg-indigo-500/20',
    icon: 'text-indigo-500',
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    hover: 'group-hover:bg-yellow-500/20',
    icon: 'text-yellow-500',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    hover: 'group-hover:bg-cyan-500/20',
    icon: 'text-cyan-500',
  },
};

function GamesCard() {
  return (
    <div className="relative bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="absolute top-2 right-2">
        <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
          LIVE
        </span>
      </div>
      <div className="flex gap-2 mb-3">
        {GAME_ITEMS.map((game) => (
          <Link
            key={game.label}
            to={game.path}
            className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center hover:bg-yellow-500/20 transition-colors"
            title={game.label}
          >
            <span className="text-yellow-500">{game.icon}</span>
          </Link>
        ))}
      </div>
      <h3 className="font-medium text-theme-text-primary">Games</h3>
      <p className="text-xs xl:text-sm text-theme-text-muted mt-1">Lottery, Scratch & Quick Pick</p>
    </div>
  );
}

export function QuickActions() {
  const [hoveredDisabled, setHoveredDisabled] = useState<string | null>(null);
  const isAppAdmin = useAppAdmin();

  // Split actions: first 3 (Row 1), then remaining (Row 2 after Games)
  const row1 = ACTIONS.slice(0, 3);
  const row2 = ACTIONS.slice(3);

  const renderAction = (action: ActionItem) => {
    const colors = COLOR_CLASSES[action.color];
    const enabled = action.enabled || isAppAdmin;

    if (!enabled) {
      return (
        <div
          key={action.id}
          className="relative bg-theme-bg-secondary border border-theme-border rounded-xl p-4 opacity-60 cursor-not-allowed"
          onMouseEnter={() => setHoveredDisabled(action.id)}
          onMouseLeave={() => setHoveredDisabled(null)}
        >
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full">
              Soon
            </span>
          </div>

          <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center mb-3`}>
            <span className={colors.icon}>{action.icon}</span>
          </div>
          <h3 className="font-medium text-theme-text-muted">{action.label}</h3>
          <p className="text-xs xl:text-sm text-theme-text-muted mt-1">{action.description}</p>

          {hoveredDisabled === action.id && action.tooltip && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg shadow-lg z-10 whitespace-nowrap">
              <p className="text-xs xl:text-sm text-theme-text-secondary">{action.tooltip}</p>
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-theme-border" />
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={action.id}
        to={action.path}
        className="relative bg-theme-bg-secondary border border-theme-border rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors group"
      >
        {action.badge && (
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
              {action.badge}
            </span>
          </div>
        )}
        <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center mb-3 ${colors.hover} transition-colors`}>
          <span className={colors.icon}>{action.icon}</span>
        </div>
        <h3 className="font-medium text-theme-text-primary">{action.label}</h3>
        <p className="text-xs xl:text-sm text-theme-text-muted mt-1">{action.description}</p>
      </Link>
    );
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {row1.map(renderAction)}
      <GamesCard />
      {row2.map(renderAction)}
    </div>
  );
}
