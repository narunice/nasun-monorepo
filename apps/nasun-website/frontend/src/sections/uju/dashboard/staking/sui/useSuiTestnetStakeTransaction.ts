import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSigner,
  buildStakeTransaction,
  buildUnstakeTransaction,
  isValidAddress,
} from "@nasun/wallet";
import {
  getSuiTestnetClient,
  MIN_STAKE_MIST,
  MIN_STAKE_SUI,
} from "./suiTestnet";

export type SuiTxStatus = "idle" | "pending" | "success" | "failure";

export interface SuiTxResult {
  digest: string;
  status: "success" | "failure";
  error?: string;
}

export function useSuiTestnetStakeTransaction() {
  const { signer, address, isConnected } = useSigner();
  const qc = useQueryClient();
  const [status, setStatus] = useState<SuiTxStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SuiTxResult | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setLastResult(null);
  }, []);

  const refreshAll = useCallback(() => {
    if (!address) return;
    qc.invalidateQueries({ queryKey: ["sui-testnet", "stakes", address] });
    qc.invalidateQueries({ queryKey: ["sui-testnet", "balance", address] });
  }, [qc, address]);

  const stake = useCallback(
    async (validatorAddress: string, amountMist: bigint): Promise<SuiTxResult> => {
      if (!signer || !address || !isConnected) {
        const e = "Wallet is not connected";
        setError(e);
        throw new Error(e);
      }
      if (!isValidAddress(validatorAddress)) {
        const e = "Invalid validator address";
        setError(e);
        throw new Error(e);
      }
      if (amountMist < MIN_STAKE_MIST) {
        const e = `Minimum stake is ${MIN_STAKE_SUI} SUI`;
        setError(e);
        throw new Error(e);
      }

      setStatus("pending");
      setError(null);

      try {
        const client = getSuiTestnetClient();
        const tx = buildStakeTransaction(amountMist, validatorAddress);
        tx.setSender(address);

        const txBytes = await tx.build({ client });
        const { signature } = await signer.sign(txBytes);

        const result = await client.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true },
        });

        const ok = result.effects?.status?.status === "success";
        const out: SuiTxResult = {
          digest: result.digest,
          status: ok ? "success" : "failure",
          error: result.effects?.status?.error,
        };
        setLastResult(out);
        setStatus(ok ? "success" : "failure");
        if (!ok) setError(out.error ?? "Stake failed");
        refreshAll();
        return out;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stake failed";
        setError(msg);
        setStatus("failure");
        const out: SuiTxResult = { digest: "", status: "failure", error: msg };
        setLastResult(out);
        throw err;
      }
    },
    [signer, address, isConnected, refreshAll]
  );

  const unstake = useCallback(
    async (stakedSuiId: string): Promise<SuiTxResult> => {
      if (!signer || !address || !isConnected) {
        const e = "Wallet is not connected";
        setError(e);
        throw new Error(e);
      }
      if (!stakedSuiId.startsWith("0x")) {
        const e = "Invalid stake object";
        setError(e);
        throw new Error(e);
      }

      setStatus("pending");
      setError(null);

      try {
        const client = getSuiTestnetClient();
        const tx = buildUnstakeTransaction(stakedSuiId);
        tx.setSender(address);

        const txBytes = await tx.build({ client });
        const { signature } = await signer.sign(txBytes);

        const result = await client.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true },
        });

        const ok = result.effects?.status?.status === "success";
        const out: SuiTxResult = {
          digest: result.digest,
          status: ok ? "success" : "failure",
          error: result.effects?.status?.error,
        };
        setLastResult(out);
        setStatus(ok ? "success" : "failure");
        if (!ok) setError(out.error ?? "Unstake failed");
        refreshAll();
        return out;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unstake failed";
        setError(msg);
        setStatus("failure");
        const out: SuiTxResult = { digest: "", status: "failure", error: msg };
        setLastResult(out);
        throw err;
      }
    },
    [signer, address, isConnected, refreshAll]
  );

  return { status, error, lastResult, stake, unstake, reset };
}
