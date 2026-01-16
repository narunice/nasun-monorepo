/**
 * Navigation Types for Nasun Wallet UI
 *
 * Hierarchical Section/View structure replacing flat ViewMode.
 * Supports experience-centered navigation with simple/advanced modes.
 */

/**
 * Main navigation sections
 */
export type Section =
  | 'home'
  | 'send'
  | 'invest'
  | 'nft'
  | 'activity'
  | 'settings'
  | 'onboarding';

/**
 * Home section views
 */
export type HomeView = 'dashboard';

/**
 * Send section views
 */
export type SendView = 'transfer' | 'nasun-link' | 'payment-qr';

/**
 * Invest section views
 */
export type InvestView = 'staking-overview' | 'validator-select' | 'stake' | 'unstake';

/**
 * NFT section views
 */
export type NFTView = 'gallery' | 'detail' | 'transfer';

/**
 * Activity section views
 */
export type ActivityView = 'history';

/**
 * Settings section views
 */
export type SettingsView = 'account' | 'security' | 'advanced' | 'developer';

/**
 * Onboarding section views
 */
export type OnboardingView = 'welcome' | 'login-method' | 'purpose' | 'security-progress';

/**
 * All possible views (union type)
 */
export type View =
  | HomeView
  | SendView
  | InvestView
  | NFTView
  | ActivityView
  | SettingsView
  | OnboardingView;

/**
 * Navigation state combining section and view
 */
export interface NavigationState {
  section: Section;
  view: View;
  /** Optional parameters (e.g., NFT id, transaction digest) */
  params?: Record<string, string>;
}

/**
 * User purpose selection for personalized experience
 */
export type UserPurpose = 'asset' | 'invest' | 'nft' | 'all';

/**
 * Default views for each section
 */
export const DEFAULT_VIEWS: Record<Section, View> = {
  home: 'dashboard',
  send: 'transfer',
  invest: 'staking-overview',
  nft: 'gallery',
  activity: 'history',
  settings: 'account',
  onboarding: 'welcome',
};

/**
 * Legacy ViewMode to new Section/View mapping
 * For backwards compatibility during migration
 */
export const LEGACY_VIEW_MODE_MAP: Record<string, NavigationState> = {
  main: { section: 'home', view: 'dashboard' },
  send: { section: 'send', view: 'transfer' },
  receive: { section: 'home', view: 'dashboard' },
  portfolio: { section: 'home', view: 'dashboard' },
  staking: { section: 'invest', view: 'staking-overview' },
  nfts: { section: 'nft', view: 'gallery' },
  settings: { section: 'settings', view: 'account' },
  'address-book': { section: 'settings', view: 'account' },
  create: { section: 'onboarding', view: 'login-method' },
  'create-backup': { section: 'onboarding', view: 'security-progress' },
  unlock: { section: 'onboarding', view: 'login-method' },
  import: { section: 'onboarding', view: 'login-method' },
  export: { section: 'settings', view: 'security' },
  'ledger-connect': { section: 'settings', view: 'security' },
  'ledger-select': { section: 'settings', view: 'security' },
};
