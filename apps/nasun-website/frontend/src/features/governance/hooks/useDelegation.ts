/**
 * useDelegation Hook
 *
 * Manages voting power delegation state and transactions.
 * Interacts with the delegation.move smart contract.
 */

import { useState, useCallback, useEffect } from "react";
import { useWallet, useZkLogin, getSuiClient } from "@nasun/wallet";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";

export interface DelegationState {
  hasDelegated: boolean;
  delegate: string | null;
  delegators: string[];
  delegatorCount: number;
}

interface UseDelegationReturn {
  delegationState: DelegationState | null;
  isLoading: boolean;
  error: string | null;
  delegate: (toAddress: string) => Promise<boolean>;
  revoke: () => Promise<boolean>;
  refetch: () => void;
}

export function useDelegation(): UseDelegationReturn {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkConnected, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const packageId = useNetworkVariable("packageId");
  const delegationRegistryId = useNetworkVariable("delegationRegistryId");

  const [delegationState, setDelegationState] = useState<DelegationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = (status === "unlocked" && account) || isZkConnected;
  const walletAddress = account?.address || zkState?.address;

  // Fetch delegation registry object
  const hasRegistry = !!delegationRegistryId;
  const {
    data: registryData,
    isPending: isRegistryPending,
    error: registryError,
    refetch,
  } = useSuiClientQuery(
    "getObject",
    {
      id: delegationRegistryId || "0x0", // Placeholder to satisfy type; query won't run if disabled
      options: {
        showContent: true,
      },
    },
    {
      enabled: hasRegistry && !!isConnected,
    }
  );

  // Parse delegation state from registry
  useEffect(() => {
    if (!isConnected || !account) {
      setDelegationState(null);
      return;
    }

    // If delegation registry is not configured, show empty state
    if (!hasRegistry) {
      setDelegationState({
        hasDelegated: false,
        delegate: null,
        delegators: [],
        delegatorCount: 0,
      });
      setIsLoading(false);
      return;
    }

    if (isRegistryPending) {
      setIsLoading(true);
      return;
    }

    if (registryError) {
      setError(registryError.message);
      setIsLoading(false);
      return;
    }

    // For now, use a simpler approach - fetch delegation via devInspect
    fetchDelegationState();
  }, [isConnected, account, hasRegistry, registryData, isRegistryPending, registryError]);

  const fetchDelegationState = async () => {
    if (!account || !packageId || !delegationRegistryId) return;

    const userAddress = account.address;
    setIsLoading(true);
    setError(null);

    try {
      const suiClient = getSuiClient();

      // Call view functions to get delegation state
      // has_delegated
      const hasDelegatedTx = new Transaction();
      hasDelegatedTx.moveCall({
        target: `${packageId}::delegation::has_delegated`,
        arguments: [
          hasDelegatedTx.object(delegationRegistryId),
          hasDelegatedTx.pure.address(userAddress),
        ],
      });

      const hasDelegatedResult = await suiClient.devInspectTransactionBlock({
        sender: userAddress,
        transactionBlock: hasDelegatedTx,
      });

      let hasDelegated = false;
      let delegate: string | null = null;

      if (hasDelegatedResult.results?.[0]?.returnValues?.[0]) {
        const bytes = hasDelegatedResult.results[0].returnValues[0][0];
        hasDelegated = bytes[0] === 1;
      }

      // If delegated, get delegate address
      if (hasDelegated) {
        const getDelegateTx = new Transaction();
        getDelegateTx.moveCall({
          target: `${packageId}::delegation::get_delegate`,
          arguments: [
            getDelegateTx.object(delegationRegistryId),
            getDelegateTx.pure.address(userAddress),
          ],
        });

        const delegateResult = await suiClient.devInspectTransactionBlock({
          sender: userAddress,
          transactionBlock: getDelegateTx,
        });

        if (delegateResult.results?.[0]?.returnValues?.[0]) {
          // Parse Option<address> - skip first byte (Some/None), then read 32 bytes address
          const bytes = delegateResult.results[0].returnValues[0][0];
          if (bytes[0] === 1 && bytes.length > 1) {
            // Has value - convert bytes to hex address
            const addressBytes = bytes.slice(1, 33);
            delegate = "0x" + Array.from(addressBytes).map((b: number) => b.toString(16).padStart(2, "0")).join("");
          }
        }
      }

      // Get delegators who have delegated to this user
      const getDelegatorsTx = new Transaction();
      getDelegatorsTx.moveCall({
        target: `${packageId}::delegation::get_delegators`,
        arguments: [
          getDelegatorsTx.object(delegationRegistryId),
          getDelegatorsTx.pure.address(userAddress),
        ],
      });

      const delegatorsResult = await suiClient.devInspectTransactionBlock({
        sender: userAddress,
        transactionBlock: getDelegatorsTx,
      });

      let delegators: string[] = [];
      let delegatorCount = 0;

      // Get delegator count
      const countTx = new Transaction();
      countTx.moveCall({
        target: `${packageId}::delegation::delegator_count`,
        arguments: [
          countTx.object(delegationRegistryId),
          countTx.pure.address(userAddress),
        ],
      });

      const countResult = await suiClient.devInspectTransactionBlock({
        sender: userAddress,
        transactionBlock: countTx,
      });

      if (countResult.results?.[0]?.returnValues?.[0]) {
        const bytes = countResult.results[0].returnValues[0][0];
        // Parse u64 from little-endian bytes
        // Check if bytes is an array before calling reduce
        if (Array.isArray(bytes)) {
          delegatorCount = bytes.reduce((acc: number, byte: number, idx: number) => acc + byte * Math.pow(256, idx), 0);
        } else if (typeof bytes === "number") {
          delegatorCount = bytes;
        }
      }

      setDelegationState({
        hasDelegated,
        delegate,
        delegators,
        delegatorCount,
      });
    } catch (err: any) {
      console.error("Error fetching delegation state:", err);
      // If registry doesn't exist yet, set empty state
      setDelegationState({
        hasDelegated: false,
        delegate: null,
        delegators: [],
        delegatorCount: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delegate voting power to another address
  const delegate = useCallback(
    async (toAddress: string): Promise<boolean> => {
      if (!isConnected) {
        setError("Wallet not connected");
        return false;
      }

      // Check if we have a valid wallet address
      if (!walletAddress) {
        setError("No wallet address available");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const suiClient = getSuiClient();

        const tx = new Transaction();
        tx.moveCall({
          target: `${packageId}::delegation::delegate`,
          arguments: [
            tx.object(delegationRegistryId),
            tx.pure.address(toAddress),
          ],
        });

        let result;

        // zkLogin signing path
        if (isZkConnected && zkState) {
          tx.setSender(zkState.address);
          const bytes = await tx.build({ client: suiClient });
          const signature = await zkSignTransaction(bytes);
          result = await suiClient.executeTransactionBlock({
            transactionBlock: bytes,
            signature,
            options: {
              showEffects: true,
            },
          });
        } else {
          // Mnemonic wallet signing path
          const keypair = getKeypair();
          if (!keypair) {
            setError("Failed to get keypair");
            return false;
          }
          result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: {
              showEffects: true,
            },
          });
        }

        await suiClient.waitForTransaction({
          digest: result.digest,
          options: {
            showEffects: true,
          },
        });

        // Refresh delegation state
        await fetchDelegationState();
        return true;
      } catch (err: any) {
        console.error("Delegation failed:", err);
        setError(parseDelegationError(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, walletAddress, isZkConnected, zkState, zkSignTransaction, getKeypair, packageId, delegationRegistryId]
  );

  // Revoke delegation
  const revoke = useCallback(async (): Promise<boolean> => {
    if (!isConnected) {
      setError("Wallet not connected");
      return false;
    }

    // Check if we have a valid wallet address
    if (!walletAddress) {
      setError("No wallet address available");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const suiClient = getSuiClient();

      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::delegation::revoke`,
        arguments: [tx.object(delegationRegistryId)],
      });

      let result;

      // zkLogin signing path
      if (isZkConnected && zkState) {
        tx.setSender(zkState.address);
        const bytes = await tx.build({ client: suiClient });
        const signature = await zkSignTransaction(bytes);
        result = await suiClient.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: {
            showEffects: true,
          },
        });
      } else {
        // Mnemonic wallet signing path
        const keypair = getKeypair();
        if (!keypair) {
          setError("Failed to get keypair");
          return false;
        }
        result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: {
            showEffects: true,
          },
        });
      }

      await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEffects: true,
        },
      });

      // Refresh delegation state
      await fetchDelegationState();
      return true;
    } catch (err: any) {
      console.error("Revoke failed:", err);
      setError(parseRevokeError(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, walletAddress, isZkConnected, zkState, zkSignTransaction, getKeypair, packageId, delegationRegistryId]);

  return {
    delegationState,
    isLoading: isLoading || (hasRegistry && isRegistryPending),
    error,
    delegate,
    revoke,
    refetch,
  };
}

// Parse delegation error messages
function parseDelegationError(error: any): string {
  const message = error?.message || String(error);

  if (message.includes("EAlreadyDelegated")) {
    return "You have already delegated. Please revoke first.";
  }
  if (message.includes("ESelfDelegation")) {
    return "Cannot delegate to yourself.";
  }
  if (message.includes("ECircularDelegation")) {
    return "Circular delegation detected. The target has delegated to you.";
  }
  if (message.includes("InsufficientGas") || message.includes("gas")) {
    return "Insufficient gas for transaction.";
  }

  return "Delegation failed. Please try again.";
}

// Parse revoke error messages
function parseRevokeError(error: any): string {
  const message = error?.message || String(error);

  if (message.includes("ENotDelegated")) {
    return "No active delegation to revoke.";
  }
  if (message.includes("InsufficientGas") || message.includes("gas")) {
    return "Insufficient gas for transaction.";
  }

  return "Revoke failed. Please try again.";
}
