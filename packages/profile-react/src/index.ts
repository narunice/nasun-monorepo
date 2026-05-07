export { useProfile } from './useProfile.js';
export { EcosystemAvatar, type EcosystemAvatarProps } from './EcosystemAvatar.js';
export {
  fetchPublicProfile,
  ProfileFetchError,
  type FetchProfileOptions,
} from './api.js';

// Re-export types and resolvers from -core for ergonomics: a consuming app
// only needs `import { useProfile, resolveDisplayName } from '@nasun/profile-react'`
// for typical use. Server consumers (chat-server, api-server) import from
// '@nasun/profile-core' directly to avoid the React peer dep.
export type {
  EcosystemProfile,
  LinkedAccountSummary,
  ProfileSource,
} from '@nasun/profile-core';
export {
  resolveDisplayName,
  resolveAvatarUrl,
  buildAvatarUrlFromKey,
  canonicalizeDisplayName,
  isDisplayNameCollision,
} from '@nasun/profile-core';
