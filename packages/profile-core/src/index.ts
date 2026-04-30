export type {
  EcosystemProfile,
  LinkedAccountSummary,
  ProfileSource,
} from './types.js';

export {
  canonicalizeDisplayName,
  isDisplayNameCollision,
} from './canonical.js';

export {
  resolveDisplayName,
  resolveAvatarUrl,
  buildAvatarUrlFromKey,
} from './resolvers.js';
