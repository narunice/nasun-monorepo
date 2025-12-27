/**
 * WalletModalProvider
 * 지갑 모달 상태 및 Mnemonic 백업 관리
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useWallet } from '../wallet';
import { WalletModal, MnemonicBackup } from '../components/wallet';

interface WalletModalContextType {
  openWalletModal: (mode: 'connect' | 'unlock') => void;
  closeWalletModal: () => void;
}

const WalletModalContext = createContext<WalletModalContextType | null>(null);

interface WalletModalProviderProps {
  children: ReactNode;
}

export function WalletModalProvider({ children }: WalletModalProviderProps) {
  const { _initialize } = useWallet();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletModalMode, setWalletModalMode] = useState<'connect' | 'unlock'>('connect');

  // 지갑 초기화
  useEffect(() => {
    _initialize();
  }, [_initialize]);

  const openWalletModal = (mode: 'connect' | 'unlock') => {
    setWalletModalMode(mode);
    setWalletModalOpen(true);
  };

  const closeWalletModal = () => {
    setWalletModalOpen(false);
  };

  return (
    <WalletModalContext.Provider value={{ openWalletModal, closeWalletModal }}>
      {children}

      {/* Wallet Modal */}
      <WalletModal
        isOpen={walletModalOpen}
        onClose={closeWalletModal}
        mode={walletModalMode}
        onCreateSuccess={(m) => setMnemonic(m)}
      />

      {/* Mnemonic Backup Modal */}
      {mnemonic && (
        <MnemonicBackup mnemonic={mnemonic} onConfirm={() => setMnemonic(null)} />
      )}
    </WalletModalContext.Provider>
  );
}

export function useWalletModal() {
  const context = useContext(WalletModalContext);
  if (!context) {
    throw new Error('useWalletModal must be used within WalletModalProvider');
  }
  return context;
}
