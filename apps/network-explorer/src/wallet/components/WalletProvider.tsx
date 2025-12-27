/**
 * Nasun Wallet Provider
 * 지갑 초기화 및 전역 상태 제공
 */

import { useEffect, type ReactNode } from 'react';
import { useWallet } from '../hooks/useWallet';

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * 지갑 초기화를 담당하는 내부 컴포넌트
 */
function WalletInitializer({ children }: { children: ReactNode }) {
  const _initialize = useWallet((state) => state._initialize);

  useEffect(() => {
    // 앱 시작 시 지갑 상태 초기화
    _initialize();
  }, [_initialize]);

  return <>{children}</>;
}

/**
 * WalletProvider
 * 앱의 루트에서 지갑 기능을 활성화
 *
 * 사용법:
 * ```tsx
 * <WalletProvider>
 *   <App />
 * </WalletProvider>
 * ```
 */
export function WalletProvider({ children }: WalletProviderProps) {
  return <WalletInitializer>{children}</WalletInitializer>;
}
