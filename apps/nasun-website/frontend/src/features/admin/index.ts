// Admin feature module

// Components
export { AdminRoute } from './components/AdminRoute';
export { AdminLayout } from './components/AdminLayout';
export { AdminError } from './components/AdminError';

// Hooks
export { useAdminAuth } from './hooks/useAdminAuth';
export { useUserProfile } from './hooks/useUserProfile';
export { useWhitelistStats } from './hooks/useWhitelistStats';
export { useAdminProposals, useInvalidateProposals } from './hooks/useAdminProposals';
export { useProposalVoters } from './hooks/useProposalVoters';
export { useHiddenProposals } from './hooks/useHiddenProposals';

// Types
export type {
  UserProfile,
  UserRole,
  AdminAuthState,
  ProposalSummary,
  ProposalType,
  VoterRecord,
  WhitelistStats,
  ExportOptions,
} from './types';

// Utils
export * from './utils';
