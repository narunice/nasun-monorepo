/**
 * Headless component that wires address book sync with the wallet-api.
 * Must be rendered exactly once per app, inside WalletProvider.
 */

import { useEffect } from 'react';
import {
  configureAddressBookSync,
  resetAddressBookSyncConfig,
  useAddressBookSync,
  AddressBookSessionManager,
  useSigner,
} from '@nasun/wallet';
import type { ZkLoginSigner } from '@nasun/wallet';

interface AddressBookSyncSetupProps {
  apiEndpoint: string;
}

export function AddressBookSyncSetup({ apiEndpoint }: AddressBookSyncSetupProps) {
  const { signer, address: walletAddress, signerType } = useSigner();

  useEffect(() => {
    if (!signer || !walletAddress || !apiEndpoint) {
      resetAddressBookSyncConfig();
      return;
    }

    const isZkLogin = signerType === 'zklogin';

    const session = new AddressBookSessionManager({
      apiEndpoint,
      getWalletAddress: () => walletAddress,
      signMessage: async (msg: Uint8Array) => {
        if (isZkLogin) {
          const zkSigner = signer as unknown as ZkLoginSigner;
          const result = await zkSigner.signWithEphemeralKey(msg);
          return result.signature;
        }
        const result = await signer.signPersonal(msg);
        return result.signature;
      },
      getEphemeralPublicKey: isZkLogin
        ? () => (signer as unknown as ZkLoginSigner).getEphemeralPublicKey()
        : undefined,
    });

    configureAddressBookSync({
      apiEndpoint,
      getToken: () => session.getToken(),
    });

    return () => {
      session.invalidate();
      resetAddressBookSyncConfig();
    };
  }, [signer, walletAddress, signerType, apiEndpoint]);

  useAddressBookSync({ userId: walletAddress ?? null });

  return null;
}
