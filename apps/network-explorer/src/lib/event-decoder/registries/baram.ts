/**
 * Baram ecosystem event registries (Escrow, Executor, AER)
 */
import { devnetConfig } from '@nasun/devnet-config';
import type { ProtocolEventGroup } from '../types';

// Baram Escrow events
export const BARAM_ESCROW_EVENTS: ProtocolEventGroup = {
  name: 'Baram',
  badgeVariant: 'immutable',
  packageIds: [
    devnetConfig.baram.packageId,
    // Original package ID for events emitted before contract upgrade
    devnetConfig.baram.originalPackageId,
  ],
  module: 'baram',
  events: {
    RequestCreated: {
      label: 'Request Created',
      description: 'A new AI inference request was created',
      fields: [
        { key: 'request_id', label: 'Request ID', type: 'number' },
        { key: 'requester', label: 'Requester', type: 'address' },
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'price', label: 'Price', type: 'nusdc_amount' },
        { key: 'prompt_hash', label: 'Prompt Hash', type: 'hash' },
        { key: 'model', label: 'Model', type: 'string' },
        { key: 'timeout_at', label: 'Timeout', type: 'timestamp_ms' },
      ],
    },
    RequestSettled: {
      label: 'Request Settled',
      description: 'An AI inference request was settled',
      fields: [
        { key: 'request_id', label: 'Request ID', type: 'number' },
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'result_hash', label: 'Result Hash', type: 'hash' },
        { key: 'execution_time_ms', label: 'Execution Time', type: 'number' },
        { key: 'payout', label: 'Payout', type: 'nusdc_amount' },
      ],
    },
    RequestCancelled: {
      label: 'Request Cancelled',
      description: 'An AI inference request was cancelled',
      fields: [
        { key: 'request_id', label: 'Request ID', type: 'number' },
        { key: 'requester', label: 'Requester', type: 'address' },
        { key: 'refund', label: 'Refund', type: 'nusdc_amount' },
        { key: 'reason', label: 'Reason Code', type: 'number' },
      ],
    },
  },
};

// Baram Executor events
export const BARAM_EXECUTOR_EVENTS: ProtocolEventGroup = {
  name: 'Executor',
  badgeVariant: 'immutable',
  packageIds: [devnetConfig.baram.executorPackageId],
  module: 'executor',
  events: {
    ExecutorRegistered: {
      label: 'Executor Registered',
      description: 'A new executor was registered',
      fields: [
        { key: 'operator', label: 'Operator', type: 'address' },
        { key: 'name', label: 'Name', type: 'string' },
        { key: 'endpoint_url', label: 'Endpoint', type: 'string' },
        { key: 'tee_type', label: 'TEE Type', type: 'number' },
      ],
    },
    ExecutorUpdated: {
      label: 'Executor Updated',
      description: 'Executor profile was updated',
      fields: [
        { key: 'operator', label: 'Operator', type: 'address' },
        { key: 'name', label: 'Name', type: 'string' },
        { key: 'endpoint_url', label: 'Endpoint', type: 'string' },
        { key: 'is_active', label: 'Active', type: 'boolean' },
      ],
    },
    ExecutorDeactivated: {
      label: 'Executor Deactivated',
      description: 'An executor was deactivated',
      fields: [
        { key: 'operator', label: 'Operator', type: 'address' },
        { key: 'reason', label: 'Reason', type: 'string' },
      ],
    },
    ExecutorStatsUpdated: {
      label: 'Stats Updated',
      description: 'Executor statistics were updated',
      fields: [
        { key: 'operator', label: 'Operator', type: 'address' },
        { key: 'completed_jobs', label: 'Completed', type: 'number' },
        { key: 'failed_jobs', label: 'Failed', type: 'number' },
        { key: 'reputation', label: 'Reputation', type: 'number' },
      ],
    },
    ExecutorEndpointUpdated: {
      label: 'Endpoint Updated',
      description: 'Executor endpoint URL was updated',
      fields: [
        { key: 'operator', label: 'Operator', type: 'address' },
        { key: 'endpoint_url', label: 'Endpoint', type: 'string' },
      ],
    },
    ReputationDecayed: {
      label: 'Reputation Decayed',
      description: 'Executor reputation was reduced due to inactivity',
      fields: [
        { key: 'operator', label: 'Operator', type: 'address' },
        { key: 'old_reputation', label: 'Old Reputation', type: 'number' },
        { key: 'new_reputation', label: 'New Reputation', type: 'number' },
      ],
    },
  },
};

// Baram Executor Staking events (executor_staking module)
export const BARAM_EXECUTOR_STAKING_EVENTS: ProtocolEventGroup = {
  name: 'Executor Staking',
  badgeVariant: 'immutable',
  packageIds: [devnetConfig.baram.executorPackageId],
  module: 'executor_staking',
  events: {
    Staked: {
      label: 'Staked',
      description: 'Tokens were staked for an executor',
      fields: [
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'amount', label: 'Amount', type: 'nasun_amount' },
        { key: 'total_staked', label: 'Total Staked', type: 'nasun_amount' },
      ],
    },
    UnbondingStarted: {
      label: 'Unbonding Started',
      description: 'Stake unbonding period began',
      fields: [
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'amount', label: 'Amount', type: 'nasun_amount' },
        { key: 'available_at', label: 'Available At', type: 'timestamp_ms' },
      ],
    },
    Withdrawn: {
      label: 'Withdrawn',
      description: 'Unbonded stake was withdrawn',
      fields: [
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'amount', label: 'Amount', type: 'nasun_amount' },
      ],
    },
    Slashed: {
      label: 'Slashed',
      description: 'Executor stake was slashed for violation',
      fields: [
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'amount', label: 'Amount', type: 'nasun_amount' },
        { key: 'reason', label: 'Reason Code', type: 'number' },
        { key: 'request_id', label: 'Request ID', type: 'number' },
      ],
    },
  },
};

// Baram Executor Tier events (executor_tier module)
export const BARAM_EXECUTOR_TIER_EVENTS: ProtocolEventGroup = {
  name: 'Executor Tier',
  badgeVariant: 'immutable',
  packageIds: [devnetConfig.baram.executorPackageId],
  module: 'executor_tier',
  events: {
    TierRegistryCreated: {
      label: 'Tier Registry Created',
      description: 'Tier registry was initialized',
      fields: [
        { key: 'registry_id', label: 'Registry ID', type: 'address' },
      ],
    },
    TierChanged: {
      label: 'Tier Changed',
      description: 'Executor tier was updated',
      fields: [
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'old_tier', label: 'Old Tier', type: 'number' },
        { key: 'new_tier', label: 'New Tier', type: 'number' },
        { key: 'stake_amount', label: 'Stake Amount', type: 'nasun_amount' },
        { key: 'reputation', label: 'Reputation', type: 'number' },
      ],
    },
    ExecutorTierRemoved: {
      label: 'Tier Removed',
      description: 'Executor was removed from tier registry',
      fields: [
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'old_tier', label: 'Old Tier', type: 'number' },
      ],
    },
  },
};

// Baram AER (AI Execution Report) events
export const BARAM_AER_EVENTS: ProtocolEventGroup = {
  name: 'AER',
  badgeVariant: 'immutable',
  packageIds: [devnetConfig.baram.aerPackageId],
  module: 'aer',
  events: {
    ExecutionReportCreated: {
      label: 'Execution Report',
      description: 'An AI execution report was created',
      fields: [
        { key: 'request_id', label: 'Request ID', type: 'number' },
        { key: 'record_id', label: 'Record ID', type: 'address' },
        { key: 'initiator', label: 'Initiator', type: 'address' },
        { key: 'executor', label: 'Executor', type: 'address' },
        { key: 'model_name', label: 'Model', type: 'string' },
        { key: 'payment_amount', label: 'Payment', type: 'nusdc_amount' },
        { key: 'executor_tier', label: 'Tier', type: 'number' },
        { key: 'tee_verified', label: 'TEE Verified', type: 'boolean' },
        { key: 'settled_at', label: 'Settled At', type: 'timestamp_ms' },
      ],
    },
    PolicyUpdated: {
      label: 'Policy Updated',
      description: 'AER policy was updated',
      fields: [
        { key: 'new_version', label: 'New Version', type: 'number' },
      ],
    },
  },
};
