import { NETWORK_CONFIG } from '@/config/network';

export function getExplorerTxUrl(digest: string): string {
  return `${NETWORK_CONFIG.explorerUrl}/tx/${digest}`;
}

export function getExplorerObjectUrl(objectId: string): string {
  return `${NETWORK_CONFIG.explorerUrl}/object/${objectId}`;
}
