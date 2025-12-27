export interface WalletAddress {
  identityId: string;
  walletAddress: string;
  blockchain?: 'sui' | 'iota' | 'ethereum';
  createdAt: string;
  updatedAt: string;
}

export interface GetWalletRequest {
  identityId: string;
}

export interface SaveWalletRequest {
  identityId: string;
  walletAddress: string;
  blockchain?: 'sui' | 'iota' | 'ethereum';
}

export interface DeleteWalletRequest {
  identityId: string;
}
