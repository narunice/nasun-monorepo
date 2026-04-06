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
  { path: '/admin/devnet-metrics', label: 'Devnet Metrics', icon: '📈' },
  { path: '/admin/users', label: 'Users', icon: '👥' },
  { path: '/admin/leaderboard-v3', label: 'Leaderboard V3', icon: '🏆' },
  { path: '/admin/featured-feed', label: 'Featured Feed', icon: '⭐' },
  { path: '/admin/alliance-nft', label: 'Alliance NFT', icon: '🛡️' },
  { path: '/admin/whitelist', label: 'Allowlist Export', icon: '📋' },
  { path: '/admin/airdrop', label: 'Airdrop', icon: '🪂' },
  { path: '/admin/governance', label: 'Governance', icon: '🗳️' },
  { path: '/admin/points', label: 'Ecosystem Points', icon: '🎯' },
  { path: '/admin/nft-collections', label: 'Nasun NFT on ETH', icon: '🖼️' },
  { path: '/admin/genesis-pass-drop', label: 'Genesis Pass Drop', icon: '🎫' },
];

export const ADMIN_DASHBOARD_FEATURES: AdminFeature[] = [
  {
    title: 'Devnet Metrics',
    description: 'Monitor daily active addresses, new addresses, transaction counts, and cumulative growth on Nasun Devnet.',
    icon: '📈',
    link: '/admin/devnet-metrics',
    linkText: 'View Metrics',
  },
  {
    title: 'User Management',
    description: 'Browse and search all registered user accounts, view details and linked providers.',
    icon: '👥',
    link: '/admin/users',
    linkText: 'View Users',
  },
  {
    title: 'Leaderboard V3',
    description: 'Register posts, manage seasons, view leaderboard rankings, and monitor engagement scores.',
    icon: '🏆',
    link: '/admin/leaderboard-v3',
    linkText: 'Manage Leaderboard',
  },
  {
    title: 'Featured Feed',
    description: 'Curate the featured posts that appear on the leaderboard sidebar. Select posts, assign badges, and reorder.',
    icon: '⭐',
    link: '/admin/featured-feed',
    linkText: 'Manage Feed',
  },
  {
    title: 'Governance',
    description: 'Create proposals, view voting results, monitor participation, and export vote data for analysis.',
    icon: '🗳️',
    link: '/admin/governance',
    linkText: 'Manage Governance',
  },
  {
    title: 'Allowlist Export',
    description: 'Download Frontiers Allowlist and Battalion NFT Allowlist as CSV files with date filtering capabilities.',
    icon: '📋',
    link: '/admin/whitelist',
    linkText: 'Manage Allowlist',
  },
  {
    title: 'NFT Collections',
    description: 'Manage which NFT collections appear in MY ASSETS. Control contract addresses, chains, and enable/disable visibility.',
    icon: '🖼️',
    link: '/admin/nft-collections',
    linkText: 'Manage NFTs',
  },
  {
    title: 'Ecosystem Points',
    description: 'Monitor on-chain activity points scanner, view leaderboard rankings, and look up user points by wallet address.',
    icon: '🎯',
    link: '/admin/points',
    linkText: 'View Points',
  },
  {
    title: 'Airdrop',
    description: 'Manage April 16th Airdrop registrations. View applicants, approve or revert status.',
    icon: '🪂',
    link: '/admin/airdrop',
    linkText: 'Manage Airdrop',
  },
  {
    title: 'Alliance NFT',
    description: 'Monitor Alliance NFT minting progress in real-time. View total minted, remaining supply, and collection preview.',
    icon: '🛡️',
    link: '/admin/alliance-nft',
    linkText: 'View Alliance NFT',
  },
];
