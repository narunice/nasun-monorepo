/**
 * WalletConnect Module
 *
 * Exports for WalletConnect v2 integration.
 */

export { WalletConnectClient } from './client';

export {
  handleWCRequest,
  getRequestDescription,
} from './handlers';

export {
  EIP155_NAMESPACE,
  SUI_NAMESPACE,
  EVM_METHODS,
  EVM_EVENTS,
  SUI_METHODS,
  SUI_EVENTS,
  buildEIP155Namespace,
  buildSuiNamespace,
  buildSessionNamespaces,
  canSatisfyProposal,
  getChainIdFromCAIP2,
  isEVMChainId,
  isSuiChainId,
  getAllSupportedChainIds,
} from './namespaces';

export type {
  WalletConnectConfig,
  EVMMethod,
  SuiMethod,
  WCMethod,
  WCRequest,
  EVMTransactionParams,
  SuiTransactionParams,
  WalletConnectState,
  WCEvent,
  WCEventListener,
  ParsedChainId,
  SessionApprovalParams,
  DAppMetadata,
} from './types';

export {
  getDAppMetadata,
  parseChainId,
  formatAccountId,
} from './types';
