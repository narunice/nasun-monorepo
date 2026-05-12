/**
 * @nasun/baram-sdk - AER v2 namespace.
 *
 * Public API for the canonical execution ledger schema. Import as:
 *   import { aer } from '@nasun/baram-sdk';
 *   const report = aer.decodeAER(bytes);
 */

export type {
  EventClass,
  ActionOutcome,
  TriggerType,
  RequesterContext,
  ExecutorContext,
  PaymentContext,
  InferenceContext,
  WhyContext,
  TrustContext,
  TimeContext,
  IntentLineage,
  ChainContext,
  ActionEnvelope,
  WakeContext,
  ReplayContext,
  AERReport,
} from './types';
export { EVENT_CLASS_TAG, ACTION_OUTCOME_TAG, TRIGGER_TYPE_TAG } from './types';

export {
  AIExecutionReportBcs,
  AERCodecError,
  decodeAER,
  encodeAER,
  compareKeysCanonical,
} from './codec';

export {
  generateIntentId,
  intentIdTimestampMs,
  isUuidV7,
  isCanonicalKeySequence,
  computePayloadHash,
} from './helpers';

export type { TradeSwapV1, TradeSwapDirection, DecodedPayload } from './actions';
export {
  TradeSwapV1Payload,
  decodeTradeSwapV1,
  encodeTradeSwapV1,
  decodeActionPayload,
} from './actions';
