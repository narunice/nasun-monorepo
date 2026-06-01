/**
 * Wallet-signed vault mutations. Build pattern mirrors useAgentActions.ts:
 * tx.setSender → tx.build({client}) → signer.sign → executeTransactionBlock,
 * then assert effects.status === 'success'. Coin inputs are fetched via
 * suiClient.getCoins for the relevant coin type.
 */
import { useCallback, useRef, useState } from "react";
import { useSigner } from "@nasun/wallet";
import { NUSDC_TYPE, DEEP_TOKEN_PACKAGE_ID } from "@nasun/devnet-config";
import { suiClient } from "@/lib/sui-client";
import {
  buildVaultDepositTx,
  buildVaultRequestWithdrawalTx,
  buildVaultClaimWithdrawalTx,
  buildVaultCrystallizeFeeTx,
  buildCreateVaultTx,
  type CoinInput,
} from "./vaultTx";
import type { Transaction } from "@mysten/sui/transactions";

const DEEP_TYPE = `${DEEP_TOKEN_PACKAGE_ID}::deep::DEEP`;

export type VaultTxStatus =
  | "idle"
  | "signing"
  | "executing"
  | "success"
  | "error";

// Page through ALL coins of a type (getCoins is paginated ~50/page). Returning
// only the first page would drop coins for wallets with fragmented balances,
// making splitCoins abort on-chain even though the wallet holds enough. Also
// returns the summed balance so callers can pre-flight before building a tx.
async function fetchCoins(
  owner: string,
  coinType: string,
): Promise<{ coins: CoinInput[]; total: bigint }> {
  const coins: CoinInput[] = [];
  let total = 0n;
  let cursor: string | null | undefined = null;
  do {
    const page = await suiClient.getCoins({ owner, coinType, cursor });
    for (const c of page.data) {
      coins.push({ objectId: c.coinObjectId });
      total += BigInt(c.balance);
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return { coins, total };
}

export function useVaultActions() {
  const { signer, address } = useSigner();
  const [status, setStatus] = useState<VaultTxStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const execute = useCallback(
    async (tx: Transaction): Promise<string | null> => {
      if (inFlight.current) return null;
      if (!signer || !address) {
        setError("Wallet not connected");
        setStatus("error");
        return null;
      }
      inFlight.current = true;
      setStatus("signing");
      setError(null);
      try {
        tx.setSender(address);
        const txBytes = await tx.build({ client: suiClient });
        const { signature } = await signer.sign(txBytes);
        setStatus("executing");
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true },
        });
        if (result.effects?.status?.status !== "success") {
          throw new Error(result.effects?.status?.error || "Transaction failed");
        }
        setStatus("success");
        return result.digest;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transaction failed");
        setStatus("error");
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [signer, address],
  );

  const deposit = useCallback(
    // MVP: minSharesOut defaults to 0 (no slippage protection). The vault is a
    // single NAV-priced pool on devnet; a depositor-set tolerance is a
    // follow-up once the deposit UI surfaces an expected-shares quote.
    // TODO(vault): compute minSharesOut from a slippage tolerance × quote.
    async (
      vaultId: string,
      amountRaw: bigint,
      minSharesOut: bigint = 0n,
    ): Promise<string | null> => {
      if (!address) return null;
      const { coins, total } = await fetchCoins(address, NUSDC_TYPE);
      if (total < amountRaw) {
        setError("Insufficient NUSDC balance");
        setStatus("error");
        return null;
      }
      return execute(
        buildVaultDepositTx({ vaultId, nusdcCoins: coins, amountRaw, minSharesOut }),
      );
    },
    [execute, address],
  );

  const requestWithdrawal = useCallback(
    (vaultId: string, shares: bigint) =>
      execute(buildVaultRequestWithdrawalTx(vaultId, shares)),
    [execute],
  );

  const claimWithdrawal = useCallback(
    (vaultId: string) => {
      if (!address) return Promise.resolve(null);
      return execute(buildVaultClaimWithdrawalTx(vaultId, address));
    },
    [execute, address],
  );

  const crystallizeFee = useCallback(
    (vaultId: string) => execute(buildVaultCrystallizeFeeTx(vaultId)),
    [execute],
  );

  const createVault = useCallback(
    async (params: {
      agentProfileId: string;
      capabilityId: string;
      nusdcSeedRaw: bigint;
      deepSeedRaw: bigint;
      performanceFeeBps: bigint;
    }): Promise<string | null> => {
      if (!address) return null;
      const [nusdc, deep] = await Promise.all([
        fetchCoins(address, NUSDC_TYPE),
        fetchCoins(address, DEEP_TYPE),
      ]);
      if (nusdc.total < params.nusdcSeedRaw) {
        setError("Insufficient NUSDC balance for seed");
        setStatus("error");
        return null;
      }
      if (deep.total < params.deepSeedRaw) {
        setError("Insufficient DEEP balance for seed");
        setStatus("error");
        return null;
      }
      return execute(
        buildCreateVaultTx({
          ...params,
          nusdcCoins: nusdc.coins,
          deepCoins: deep.coins,
        }),
      );
    },
    [execute, address],
  );

  return {
    status,
    error,
    address,
    deposit,
    requestWithdrawal,
    claimWithdrawal,
    crystallizeFee,
    createVault,
  };
}
