/**
 * MetaMask Ethereum Wallet Utilities
 *
 * MetaMask 지갑과 상호작용하는 유틸리티 함수들
 * - 지갑 연결, 네트워크 전환, 메시지 서명 등
 */

import type {
  MetaMaskWalletInfo,
  MetaMaskErrorType,
} from '../types/metamask';

/**
 * MetaMask이 설치되어 있는지 확인
 */
export function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask === true;
}

/**
 * Select the MetaMask provider from potentially multiple injected providers.
 * Brave, Opera, and other browsers may inject their own window.ethereum alongside MetaMask.
 * This ensures we always interact with the actual MetaMask provider.
 */
function getMetaMaskProvider(): typeof window.ethereum {
  // @ts-expect-error - providers array exists when multiple wallets are injected
  if (window.ethereum?.providers?.length > 0) {
    // @ts-expect-error - selecting from providers
    const mmProvider = window.ethereum.providers.find((p: { isMetaMask: boolean }) => p.isMetaMask);
    if (mmProvider) return mmProvider;
  }
  return window.ethereum!;
}

/**
 * 현재 연결된 지갑 주소 가져오기
 * @throws {Error} MetaMask가 설치되지 않았거나 연결되지 않은 경우
 */
export async function getConnectedWallet(): Promise<string | null> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const accounts = await window.ethereum!.request({
      method: 'eth_accounts',
    }) as string[];

    return accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error('Failed to get connected wallet:', error);
    return null;
  }
}

/**
 * MetaMask 지갑 연결 요청
 * 사용자에게 지갑 연결 승인을 요청하고 지갑 주소를 반환
 *
 * @returns 연결된 지갑 주소 (lowercase)
 * @throws {Error} 사용자가 거부하거나 에러 발생 시
 */
export async function connectWallet(): Promise<string> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed. Please install MetaMask browser extension.');
  }

  try {
    const provider = getMetaMaskProvider();
    const accounts = await provider.request({
      method: 'eth_requestAccounts',
    }) as string[];

    if (accounts.length === 0) {
      throw new Error('No accounts found. Please unlock MetaMask.');
    }

    return accounts[0].toLowerCase();
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    // 사용자가 요청을 거부한 경우
    if (err.code === 4001) {
      throw new Error('User rejected the connection request');
    }

    console.error('Failed to connect wallet:', error);
    throw new Error(err.message || 'Failed to connect to MetaMask');
  }
}

/**
 * 현재 연결된 네트워크의 Chain ID 가져오기
 *
 * @returns Chain ID (10진수)
 */
export async function getChainId(): Promise<number> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const chainId = await window.ethereum!.request({
      method: 'eth_chainId',
    }) as string;

    // 0x로 시작하는 hex 문자열을 10진수로 변환
    return parseInt(chainId, 16);
  } catch (error) {
    console.error('Failed to get chain ID:', error);
    throw error;
  }
}

/**
 * 네트워크 파라미터 가져오기 (wallet_addEthereumChain용)
 *
 * @param chainId - Chain ID (10진수)
 * @returns 네트워크 추가에 필요한 파라미터
 */
function getNetworkParams(chainId: number) {
  switch (chainId) {
    case 1: // Ethereum Mainnet
      return {
        chainId: '0x1',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://mainnet.infura.io/v3/'],
        blockExplorerUrls: ['https://etherscan.io'],
      };
    case 11155111: // Sepolia Testnet
      return {
        chainId: '0xaa36a7',
        chainName: 'Sepolia Testnet',
        nativeCurrency: {
          name: 'Sepolia Ether',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://sepolia.infura.io/v3/'],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
      };
    default:
      throw new Error(`Unsupported network: ${chainId}`);
  }
}

/**
 * 지정된 네트워크로 전환 요청
 * 네트워크가 MetaMask에 없으면 자동으로 추가
 *
 * @param chainId - 전환할 네트워크의 Chain ID (10진수, string 또는 number)
 * @throws {Error} 네트워크 전환 실패 시
 */
export async function switchNetwork(chainId: number | string): Promise<void> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  // string을 number로 변환
  const chainIdNumber = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId;
  const chainIdHex = `0x${chainIdNumber.toString(16)}`;

  try {
    // 먼저 네트워크 전환 시도
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    console.log(`[MetaMask] Successfully switched to network ${chainIdNumber}`);
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const switchError = error as any;
    // 네트워크가 MetaMask에 추가되지 않은 경우 (에러 코드 4902)
    if (switchError.code === 4902) {
      console.log(`[MetaMask] Network ${chainIdNumber} not found, attempting to add...`);

      try {
        // 네트워크 파라미터 가져오기 (number로 전달)
        const networkParams = getNetworkParams(chainIdNumber);

        // MetaMask에 네트워크 추가 요청
        await window.ethereum!.request({
          method: 'wallet_addEthereumChain',
          params: [networkParams],
        });

        console.log(`[MetaMask] Successfully added and switched to network ${chainIdNumber}`);
      } catch (addError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = addError as any;
        // 사용자가 네트워크 추가를 거부한 경우
        if (err.code === 4001) {
          throw new Error('User rejected the request to add the network');
        }

        console.error('[MetaMask] Failed to add network:', err);
        throw new Error(`Failed to add network: ${err.message || 'Unknown error'}`);
      }
    }
    // 사용자가 전환을 거부한 경우
    else if (switchError.code === 4001) {
      throw new Error('User rejected the network switch request');
    }
    // 기타 에러
    else {
      console.error('[MetaMask] Failed to switch network:', switchError);
      throw new Error(`Failed to switch network: ${switchError.message || 'Unknown error'}`);
    }
  }
}

/**
 * 메시지에 서명 요청
 * MetaMask 팝업을 띄워 사용자에게 메시지 서명을 요청
 *
 * @param message - 서명할 메시지
 * @param walletAddress - 서명에 사용할 지갑 주소
 * @returns 서명값 (0x로 시작하는 hex 문자열)
 * @throws {Error} 서명 실패 또는 사용자 거부 시
 */
export async function signMessage(message: string, walletAddress: string): Promise<string> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const provider = getMetaMaskProvider();

    const messageHex = '0x' + Array.from(new TextEncoder().encode(message))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const signature = await provider.request({
      method: 'personal_sign',
      params: [messageHex, walletAddress.toLowerCase()],
    }) as string;

    return signature;
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    // 사용자가 서명을 거부한 경우
    if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
      throw new Error('User rejected the signature request');
    }

    console.error('Failed to sign message:', err);
    throw new Error(err.message || 'Failed to sign message');
  }
}

/**
 * Force MetaMask to show the account picker dialog.
 * Unlike connectWallet(), this always opens the account selection popup,
 * even if the site is already connected.
 *
 * @returns The selected wallet address (lowercase)
 * @throws {Error} If user rejects or MetaMask is not installed
 */
export async function requestAccountSwitch(): Promise<string> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  try {
    // wallet_requestPermissions forces MetaMask to show account picker
    await window.ethereum!.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });

    // After user selects, read the newly active account
    const accounts = await window.ethereum!.request({
      method: 'eth_accounts',
    }) as string[];

    if (accounts.length === 0) {
      throw new Error('No accounts found after permission request');
    }

    return accounts[0].toLowerCase();
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err.code === 4001) {
      throw new Error('User rejected the account switch request');
    }
    throw new Error(err.message || 'Failed to switch MetaMask account');
  }
}

/**
 * MetaMask 지갑 정보 가져오기
 *
 * @returns 지갑 주소, Chain ID, 네트워크 이름
 */
export async function getWalletInfo(): Promise<MetaMaskWalletInfo> {
  const address = await connectWallet();
  const chainId = await getChainId();

  const networkName = getNetworkName(chainId);

  return {
    address,
    chainId,
    networkName,
  };
}

/**
 * Chain ID를 기반으로 네트워크 이름 반환
 *
 * @param chainId - Chain ID (10진수)
 * @returns 네트워크 이름
 */
export function getNetworkName(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'Ethereum Mainnet';
    case 11155111:
      return 'Sepolia Testnet';
    case 5:
      return 'Goerli Testnet';
    case 137:
      return 'Polygon Mainnet';
    case 80001:
      return 'Polygon Mumbai';
    default:
      return `Unknown Network (${chainId})`;
  }
}

/**
 * 올바른 네트워크에 연결되어 있는지 확인
 *
 * @param expectedChainId - 예상 Chain ID (string 또는 number)
 * @returns 올바른 네트워크 여부
 */
export async function isCorrectNetwork(expectedChainId: number | string): Promise<boolean> {
  try {
    const currentChainId = await getChainId();
    const expectedChainIdNumber = typeof expectedChainId === 'string' ? parseInt(expectedChainId, 10) : expectedChainId;
    return currentChainId === expectedChainIdNumber;
  } catch (error) {
    console.error('Failed to check network:', error);
    return false;
  }
}

/**
 * 계정 변경 이벤트 리스너 등록
 *
 * @param callback - 계정이 변경될 때 호출될 콜백 함수
 */
export function onAccountsChanged(callback: (accounts: string[]) => void): void {
  if (!isMetaMaskInstalled()) {
    return;
  }

  window.ethereum!.on('accountsChanged', callback);
}

/**
 * 네트워크 변경 이벤트 리스너 등록
 *
 * @param callback - 네트워크가 변경될 때 호출될 콜백 함수
 */
export function onChainChanged(callback: (chainId: string) => void): void {
  if (!isMetaMaskInstalled()) {
    return;
  }

  window.ethereum!.on('chainChanged', callback);
}

/**
 * 이벤트 리스너 제거
 *
 * @param event - 이벤트 이름
 * @param callback - 제거할 콜백 함수
 */
export function removeListener(event: string, callback: (...args: unknown[]) => void): void {
  if (!isMetaMaskInstalled()) {
    return;
  }

  window.ethereum!.removeListener(event, callback);
}

/**
 * MetaMask 에러 타입 판별
 *
 * @param error - 에러 객체
 * @returns MetaMask 에러 타입
 */
export function getMetaMaskErrorType(error: unknown): MetaMaskErrorType {
  if (!isMetaMaskInstalled()) {
    return 'NO_METAMASK' as MetaMaskErrorType;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = error as any;

  if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
    return 'USER_REJECTED' as MetaMaskErrorType;
  }

  if (err.code === 4902) {
    return 'WRONG_NETWORK' as MetaMaskErrorType;
  }

  if (err.message?.includes('network')) {
    return 'NETWORK_ERROR' as MetaMaskErrorType;
  }

  return 'UNKNOWN' as MetaMaskErrorType;
}