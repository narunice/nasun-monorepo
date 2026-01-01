/**
 * QuickActions
 * Grid of action buttons for common tasks
 */

import { Link } from 'react-router-dom';

interface ActionItem {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
}

const ACTIONS: ActionItem[] = [
  {
    id: 'trade',
    label: 'Trade',
    description: 'Swap tokens',
    path: '/trade',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    color: 'blue',
    enabled: true,
  },
  {
    id: 'send',
    label: 'Send',
    description: 'Transfer tokens',
    path: '/wallet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    color: 'green',
    enabled: true,
  },
  {
    id: 'predict',
    label: 'Predict',
    description: 'Bet on events',
    path: '/predict',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'purple',
    enabled: true,
  },
  {
    id: 'earn',
    label: 'Earn',
    description: 'Coming Soon',
    path: '/earn',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'yellow',
    enabled: false,
  },
];

const COLOR_CLASSES: Record<string, { bg: string; hover: string; icon: string }> = {
  blue: {
    bg: 'bg-blue-500/10',
    hover: 'group-hover:bg-blue-500/20',
    icon: 'text-blue-500',
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
  yellow: {
    bg: 'bg-yellow-500/10',
    hover: 'group-hover:bg-yellow-500/20',
    icon: 'text-yellow-500',
  },
};

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {ACTIONS.map((action) => {
        const colors = COLOR_CLASSES[action.color];

        if (!action.enabled) {
          return (
            <div
              key={action.id}
              className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 opacity-60 cursor-not-allowed"
            >
              <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center mb-3`}>
                <span className={colors.icon}>{action.icon}</span>
              </div>
              <h3 className="font-medium text-theme-text-muted">{action.label}</h3>
              <p className="text-xs text-theme-text-muted mt-1">{action.description}</p>
            </div>
          );
        }

        return (
          <Link
            key={action.id}
            to={action.path}
            className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors group"
          >
            <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center mb-3 ${colors.hover} transition-colors`}>
              <span className={colors.icon}>{action.icon}</span>
            </div>
            <h3 className="font-medium text-theme-text-primary">{action.label}</h3>
            <p className="text-xs text-theme-text-muted mt-1">{action.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
