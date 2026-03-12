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
  { path: '/admin/users', label: 'Users', icon: '👥' },
  { path: '/admin/blacklist', label: 'Blacklist', icon: '🚫' },
  { path: '/admin/nft-collections', label: 'NFT Collections', icon: '🖼️' },
  { path: '/admin/devnet-metrics', label: 'Devnet Metrics', icon: '📈' },
];

export const ADMIN_DASHBOARD_FEATURES: AdminFeature[] = [
  {
    title: 'Whitelist Export',
    description: 'Download Frontiers Whitelist and Battalion NFT Allowlist as CSV files with date filtering capabilities.',
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
    title: 'User Management',
    description: 'Browse and search all registered user accounts, view details and linked providers.',
    icon: '👥',
    link: '/admin/users',
    linkText: 'View Users',
  },
  {
    title: 'Blacklist Management',
    description: 'Manage user bans and restrictions for the leaderboard.',
    icon: '🚫',
    link: '/admin/blacklist',
    linkText: 'Manage Blacklist',
  },
  {
    title: 'NFT Collections',
    description: 'Manage which NFT collections appear in MY ASSETS. Control contract addresses, chains, and enable/disable visibility.',
    icon: '🖼️',
    link: '/admin/nft-collections',
    linkText: 'Manage NFTs',
  },
  {
    title: 'Devnet Metrics',
    description: 'Monitor daily active addresses, new addresses, transaction counts, and cumulative growth on Nasun Devnet.',
    icon: '📈',
    link: '/admin/devnet-metrics',
    linkText: 'View Metrics',
  },
];
