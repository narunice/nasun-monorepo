/**
 * QuickActions
 * Grid of action buttons for common tasks.
 * Spot, Predict, Perpetuals, Leaderboard, Earn, Portfolio
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { hasAccess } from "../../../config/network";
import { useAppAdmin } from "../../../hooks/useAppAdmin";

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
    id: "spot",
    label: "Spot",
    description: "Buy and sell tokens instantly",
    path: "/spot",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    ),
    color: "blue",
    enabled: hasAccess("spot"),
    badge: "LIVE",
  },
  {
    id: "predict",
    label: "Predict",
    description: "Predict future events and earn",
    path: "/predict",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
    color: "indigo",
    enabled: true,
    badge: "LIVE",
  },
  {
    id: "perp",
    label: "Perpetuals",
    description: "Trade with up to 20x leverage",
    path: "/perpetuals",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    color: "purple",
    enabled: hasAccess("full"),
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    description: "See top traders and your rank",
    path: "/leaderboard",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    color: "yellow",
    enabled: hasAccess("spot"),
    badge: "LIVE",
  },
  {
    id: "earn",
    label: "Earn",
    description: "Grow your tokens with interest",
    path: "/earn",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    color: "green",
    enabled: hasAccess("full"),
  },
  {
    id: "portfolio",
    label: "Portfolio",
    description: "View your assets and activity",
    path: "/portfolio",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    color: "cyan",
    enabled: true,
    badge: "LIVE",
  },
];

const COLOR_CLASSES: Record<
  string,
  { bg: string; hover: string; icon: string }
> = {
  blue: {
    bg: "bg-pd2/10",
    hover: "group-hover:bg-pd2/20",
    icon: "text-pd3",
  },
  green: {
    bg: "bg-green-500/10",
    hover: "group-hover:bg-green-500/20",
    icon: "text-green-500",
  },
  purple: {
    bg: "bg-purple-500/10",
    hover: "group-hover:bg-purple-500/20",
    icon: "text-purple-500",
  },
  indigo: {
    bg: "bg-indigo-500/10",
    hover: "group-hover:bg-indigo-500/20",
    icon: "text-indigo-500",
  },
  yellow: {
    bg: "bg-yellow-500/10",
    hover: "group-hover:bg-yellow-500/20",
    icon: "text-yellow-500",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    hover: "group-hover:bg-cyan-500/20",
    icon: "text-cyan-500",
  },
};

export function QuickActions() {
  const [hoveredDisabled, setHoveredDisabled] = useState<string | null>(null);
  const isAppAdmin = useAppAdmin();

  const renderAction = (action: ActionItem) => {
    const colors = COLOR_CLASSES[action.color];
    const enabled = action.enabled || isAppAdmin;

    if (!enabled) {
      return (
        <div
          key={action.id}
          className="relative bg-slate-500/20 rounded-xl p-4 opacity-70 cursor-not-allowed"
          onMouseEnter={() => setHoveredDisabled(action.id)}
          onMouseLeave={() => setHoveredDisabled(null)}
        >
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full">
              Coming Soon
            </span>
          </div>

          <div
            className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center mb-3`}
          >
            <span className={colors.icon}>{action.icon}</span>
          </div>
          <h3 className="font-medium text-theme-text-muted">{action.label}</h3>
          <p className="text-xs xl:text-sm text-theme-text-muted mt-1">
            {action.description}
          </p>

          {hoveredDisabled === action.id && action.tooltip && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg shadow-lg z-10 whitespace-nowrap">
              <p className="text-xs xl:text-sm text-theme-text-secondary">
                {action.tooltip}
              </p>
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
        <div
          className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center mb-3 ${colors.hover} transition-colors`}
        >
          <span className={colors.icon}>{action.icon}</span>
        </div>
        <h3 className="font-medium text-theme-text-primary">{action.label}</h3>
        <p className="text-xs xl:text-sm text-theme-text-muted mt-1">
          {action.description}
        </p>
      </Link>
    );
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {ACTIONS.map(renderAction)}
    </div>
  );
}
