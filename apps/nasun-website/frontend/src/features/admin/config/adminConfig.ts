export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface AdminFeature {
  title: string;
  description: string;
  icon: string;
  link: string;
  linkText: string;
  disabled?: boolean;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: '📊' },
  { path: '/admin/whitelist', label: 'Whitelist Export', icon: '📋' },
  { path: '/admin/governance', label: 'Governance', icon: '🗳️' },
  { path: '/admin/leaderboard-v3', label: 'Leaderboard V3', icon: '🏆' },
  { path: '/admin/users', label: 'Blacklist', icon: '🚫' },
];

export const ADMIN_DASHBOARD_FEATURES: AdminFeature[] = [
  {
    title: 'Whitelist Export',
    description: 'Download Genesis NFT Whitelist and Battalion NFT Allowlist as CSV files with date filtering capabilities.',
    icon: '📋',
    link: '/admin/whitelist',
    linkText: 'Manage Whitelist',
  },
  {
    title: 'Governance',
    description: 'Create proposals, view voting results, monitor participation, and export vote data for analysis.',
    icon: '🗳️',
    link: '/admin/governance',
    linkText: 'Manage Governance',
  },
  {
    title: 'Leaderboard V3',
    description: 'Register posts, manage seasons, view leaderboard rankings, and monitor engagement scores.',
    icon: '🏆',
    link: '/admin/leaderboard-v3',
    linkText: 'Manage Leaderboard',
  },
  {
    title: 'Blacklist Management',
    description: 'Manage user bans and restrictions. (Feature currently in planning phase)',
    icon: '🚫',
    link: '/admin/users',
    linkText: 'Manage Users',
  },
  {
    title: 'Coming Soon',
    description: 'More admin features including X Health Monitor and Pipeline Status will be available in future updates.',
    icon: '🚀',
    link: '/admin',
    linkText: 'Stay tuned',
    disabled: true,
  },
];
