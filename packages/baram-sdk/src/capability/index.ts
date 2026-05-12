/**
 * @nasun/baram-sdk - capability namespace.
 *
 * Plan B introduces the Capability primitive that gates AER creation. Import
 * as:
 *   import { capability } from '@nasun/baram-sdk';
 *   const cap = await capability.fetchCapability(client, capId);
 *   if (capability.preflight(cap, input).ok) { ... }
 */

export type {
  Capability,
  RiskLimits,
  PauseMode,
  MutationKind,
  CapabilityCreatedEvent,
  CapabilityMutatedEvent,
  CapabilityRevokedEvent,
} from './types';
export { PAUSE_MODE_TAG, MUTATION_KIND_TAG } from './types';

export {
  CapabilityBcs,
  CapabilityCodecError,
  decodeCapability,
  pauseModeFromTag,
  pauseModeToTag,
  mutationKindFromTag,
  mutationKindToTag,
} from './codec';

export {
  fetchCapability,
  checkActionAllowed,
  checkPaymentAllowed,
  preflight,
} from './client';
export type { PreflightInput, PreflightResult } from './client';

export type { MutationArgs } from './summarize';
export { summarizeMutation } from './summarize';
