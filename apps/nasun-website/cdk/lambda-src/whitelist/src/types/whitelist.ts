/**
 * NFT Whitelist 시스템 타입 정의
 */

export interface WhitelistItem {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: string;
  joinedAt: string;
  status: 'ACTIVE' | 'WITHDRAWN';
  withdrawnAt?: string;
}

export interface JoinRequest {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: string;
}

export interface WithdrawRequest {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: string;
}

export interface CheckResponse {
  registered: boolean;
  walletAddress: string;
  joinedAt?: string;
  status?: 'ACTIVE' | 'WITHDRAWN';
}

export interface WhitelistListRequest {
  page?: number;
  limit?: number;
  status?: 'ACTIVE' | 'WITHDRAWN' | 'ALL';
  search?: string;
  sortBy?: 'joinedAt' | 'walletAddress';
  sortOrder?: 'asc' | 'desc';
}

export interface WhitelistListResponse {
  items: WhitelistItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statistics: {
    totalActive: number;
    totalWithdrawn: number;
    totalAll: number;
  };
}
