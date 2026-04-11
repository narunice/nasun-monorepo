/**
 * GamesNav
 * Horizontal tab navigation for game pages.
 * Shown at the top of all game pages to enable switching between games.
 * On desktop, this supplements the header dropdown. On mobile, this is the
 * primary way to navigate between games (bottom nav goes straight to Lottery).
 */

import { Link, useLocation } from 'react-router-dom';

interface GameNavItem {
  label: string;
  path: string;
}

const GAME_ITEMS: GameNavItem[] = [
  { label: 'Lottery', path: '/games/lottery' },
  { label: 'Scratch Cards', path: '/games/scratch' },
  { label: 'Number Match', path: '/games/numbermatch' },
  { label: 'History', path: '/games/history' },
];

export function GamesNav() {
  const { pathname } = useLocation();

  const isActive = (path: string) => {
    if (path === '/games/lottery') {
      return pathname === path || pathname.startsWith('/games/lottery/');
    }
    return pathname === path;
  };

  return (
    <nav className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-theme-border -mx-4 px-4 md:mx-0 md:px-0">
      {GAME_ITEMS.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              active
                ? 'text-theme-text-primary border-theme-accent'
                : 'text-theme-text-muted border-transparent hover:text-theme-text-secondary hover:border-theme-border'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
