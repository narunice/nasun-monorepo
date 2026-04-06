import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther } from "viem";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { GENESIS_PASS_ABI, GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";

const STAGE_NAMES: Record<number, string> = {
  0: "PAUSED", 1: "FREE_MINT", 2: "GTD_ALLOWLIST", 3: "FCFS_ALLOWLIST", 4: "PUBLIC",
};

function getContractAddress(chainId: number): `0x${string}` | undefined {
  const addr = GENESIS_PASS_ADDRESSES[chainId];
  return addr ? (addr as `0x${string}`) : undefined;
}

function TxStatus({ hash, label }: { hash?: `0x${string}`; label: string }) {
  const chainId = useChainId();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  if (!hash) return null;
  const explorer = chainId === 11155111 ? "sepolia.etherscan.io" : "etherscan.io";
  return (
    <div className="mt-2 text-sm">
      {isLoading && <span className="text-amber-400">Pending: {label}...</span>}
      {isSuccess && <span className="text-green-400">Success: {label}</span>}
      <a href={`https://${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer"
        className="ml-2 text-nasun-c4 underline">View tx</a>
    </div>
  );
}

function ContractStatus({ addr }: { addr: `0x${string}` }) {
  const read = (fn: string) => useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: fn as any,
    query: { refetchInterval: 10_000 },
  });

  const { data: stage } = read("currentStage");
  const { data: price } = read("currentMintPrice");
  const { data: deadline } = read("mintDeadline");
  const { data: locked } = read("transfersUnlocked");
  const { data: hwm } = read("highWaterMark");

  // Read minted counts for all 7 types
  const mintedReads = [1,2,3,4,5,6,7].map(id =>
    useReadContract({
      address: addr, abi: GENESIS_PASS_ABI, functionName: "totalMinted" as any,
      args: [BigInt(id)], query: { refetchInterval: 10_000 },
    })
  );

  // Read stage prices
  const priceReads = [2,3,4].map(s =>
    useReadContract({
      address: addr, abi: GENESIS_PASS_ABI, functionName: "mintPricePerStage" as any,
      args: [s], query: { refetchInterval: 30_000 },
    })
  );

  const stageNum = stage != null ? Number(stage) : 0;
  const deadlineNum = deadline != null ? Number(deadline) : 0;
  const deadlineStr = deadlineNum > 0
    ? new Date(deadlineNum * 1000).toLocaleString()
    : "No deadline";
  const totalMinted = mintedReads.reduce((sum, r) => sum + (r.data != null ? Number(r.data) : 0), 0);

  return (
    <OuterBox color="c5" padding="sm">
      <h2 className="text-lg font-semibold text-nasun-white mb-4">Contract Status</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-nasun-white/50 text-sm">Stage</p>
          <p className="text-nasun-white text-lg font-bold">{STAGE_NAMES[stageNum] || stageNum}</p>
        </div>
        <div>
          <p className="text-nasun-white/50 text-sm">Current Price</p>
          <p className="text-nasun-white text-lg font-bold">
            {stageNum === 1 ? "Free" : price != null ? `${formatEther(price as bigint)} ETH` : "-"}
          </p>
        </div>
        <div>
          <p className="text-nasun-white/50 text-sm">Total Minted</p>
          <p className="text-nasun-white text-lg font-bold">{totalMinted}</p>
        </div>
        <div>
          <p className="text-nasun-white/50 text-sm">Transfers</p>
          <p className={`text-lg font-bold ${locked ? "text-green-400" : "text-amber-400"}`}>
            {locked ? "Unlocked" : "Locked"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-nasun-white/50 text-sm">Deadline</p>
          <p className="text-nasun-white text-sm">{deadlineStr}</p>
        </div>
        <div>
          <p className="text-nasun-white/50 text-sm">HighWaterMark</p>
          <p className="text-nasun-white text-sm">{hwm != null ? STAGE_NAMES[Number(hwm)] || String(hwm) : "-"}</p>
        </div>
        <div>
          <p className="text-nasun-white/50 text-sm">Contract</p>
          <p className="text-nasun-white/60 text-sm font-mono">{addr.slice(0, 8)}...{addr.slice(-6)}</p>
        </div>
      </div>

      {/* Per-type minted */}
      <div className="mt-4">
        <p className="text-nasun-white/50 text-sm mb-2">Minted per Type</p>
        <div className="flex gap-3 flex-wrap">
          {mintedReads.map((r, i) => (
            <div key={i} className="bg-nasun-white/5 rounded px-3 py-1">
              <span className="text-nasun-white/40 text-sm">#{i + 1}: </span>
              <span className="text-nasun-white text-sm font-bold">{r.data != null ? Number(r.data) : 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stage prices */}
      <div className="mt-4">
        <p className="text-nasun-white/50 text-sm mb-2">Stage Prices</p>
        <div className="flex gap-3 flex-wrap">
          {["GTD", "FCFS", "PUBLIC"].map((name, i) => (
            <div key={name} className="bg-nasun-white/5 rounded px-3 py-1">
              <span className="text-nasun-white/40 text-sm">{name}: </span>
              <span className="text-nasun-white text-sm font-bold">
                {priceReads[i].data != null ? `${formatEther(priceReads[i].data as bigint)} ETH` : "Not set"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </OuterBox>
  );
}

function AdminActions({ addr }: { addr: `0x${string}` }) {
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | undefined>();
  const [lastTxLabel, setLastTxLabel] = useState("");
  const [priceStage, setPriceStage] = useState("4");
  const [priceEth, setPriceEth] = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");

  const { writeContractAsync, isPending } = useWriteContract();

  const execTx = async (label: string, fn: () => Promise<`0x${string}`>) => {
    try {
      setLastTxHash(undefined);
      setLastTxLabel(label);
      const hash = await fn();
      setLastTxHash(hash);
    } catch (e: any) {
      alert(`Failed: ${e?.shortMessage || e?.message || "Unknown error"}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stage Control */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-lg font-semibold text-nasun-white mb-3">Stage Control</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "PAUSED", stage: 0 },
            { label: "FREE_MINT", stage: 1 },
            { label: "GTD", stage: 2 },
            { label: "FCFS", stage: 3 },
            { label: "PUBLIC", stage: 4 },
          ].map(({ label, stage }) => (
            <ButtonV3
              key={stage}
              variant="nw2"
              size="sm"
              disabled={isPending}
              onClick={() => execTx(`setStage(${label})`, () =>
                writeContractAsync({
                  address: addr, abi: GENESIS_PASS_ABI,
                  functionName: "setStage", args: [stage],
                })
              )}
            >
              {label}
            </ButtonV3>
          ))}
        </div>
        <p className="text-nasun-white/30 text-sm mt-2">
          Forward-only. Cannot go back to a previous stage (except PAUSED).
        </p>
      </OuterBox>

      {/* Price Adjustment */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-lg font-semibold text-nasun-white mb-3">Price Adjustment</h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-nasun-white/50 text-sm block mb-1">Stage</label>
            <select
              value={priceStage}
              onChange={(e) => setPriceStage(e.target.value)}
              className="bg-nasun-black border border-nasun-white/20 rounded px-3 py-2 text-nasun-white text-sm"
            >
              <option value="2">GTD</option>
              <option value="3">FCFS</option>
              <option value="4">PUBLIC</option>
            </select>
          </div>
          <div>
            <label className="text-nasun-white/50 text-sm block mb-1">Price (ETH)</label>
            <input
              type="text"
              value={priceEth}
              onChange={(e) => setPriceEth(e.target.value)}
              placeholder="0.003"
              className="bg-nasun-black border border-nasun-white/20 rounded px-3 py-2 text-nasun-white text-sm w-32"
            />
          </div>
          <ButtonV3
            variant="c1-gradient"
            size="sm"
            disabled={isPending || !priceEth}
            onClick={() => {
              const wei = parseEther(priceEth);
              execTx(`setStagePrice(${STAGE_NAMES[Number(priceStage)]}, ${priceEth} ETH)`, () =>
                writeContractAsync({
                  address: addr, abi: GENESIS_PASS_ABI,
                  functionName: "setStagePrice", args: [Number(priceStage), wei],
                })
              );
            }}
          >
            Set Price
          </ButtonV3>
        </div>
        <p className="text-nasun-white/30 text-sm mt-2">
          Takes effect immediately. No need to pause. Users see updated price within 15 seconds.
        </p>
      </OuterBox>

      {/* Deadline */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-lg font-semibold text-nasun-white mb-3">Mint Deadline</h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-nasun-white/50 text-sm block mb-1">Deadline (UTC datetime)</label>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              className="bg-nasun-black border border-nasun-white/20 rounded px-3 py-2 text-nasun-white text-sm"
            />
          </div>
          <ButtonV3
            variant="nw2"
            size="sm"
            disabled={isPending || !deadlineInput}
            onClick={() => {
              const ts = Math.floor(new Date(deadlineInput + "Z").getTime() / 1000);
              execTx(`setMintDeadline(${new Date(ts * 1000).toISOString()})`, () =>
                writeContractAsync({
                  address: addr, abi: GENESIS_PASS_ABI,
                  functionName: "setMintDeadline", args: [BigInt(ts)],
                })
              );
            }}
          >
            Set Deadline
          </ButtonV3>
          <ButtonV3
            variant="nw3"
            size="sm"
            disabled={isPending}
            onClick={() => execTx("Remove deadline", () =>
              writeContractAsync({
                address: addr, abi: GENESIS_PASS_ABI,
                functionName: "setMintDeadline", args: [BigInt(0)],
              })
            )}
          >
            Remove Deadline
          </ButtonV3>
        </div>
      </OuterBox>

      {/* Withdraw + Unlock */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-lg font-semibold text-nasun-white mb-3">Withdraw + Transfer Unlock</h2>
        <div className="flex items-end gap-3 flex-wrap mb-3">
          <div>
            <label className="text-nasun-white/50 text-sm block mb-1">Withdraw to address</label>
            <input
              type="text"
              value={withdrawAddr}
              onChange={(e) => setWithdrawAddr(e.target.value)}
              placeholder="0x..."
              className="bg-nasun-black border border-nasun-white/20 rounded px-3 py-2 text-nasun-white text-sm w-96"
            />
          </div>
          <ButtonV3
            variant="c1-gradient"
            size="sm"
            disabled={isPending || !withdrawAddr}
            onClick={() => execTx(`withdrawTo(${withdrawAddr.slice(0, 8)}...)`, () =>
              writeContractAsync({
                address: addr, abi: GENESIS_PASS_ABI,
                functionName: "withdrawTo", args: [withdrawAddr as `0x${string}`],
              })
            )}
          >
            Withdraw All ETH
          </ButtonV3>
        </div>
        <ButtonV3
          variant="red"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (!confirm("This is irreversible. Transfers will be permanently unlocked. Continue?")) return;
            execTx("unlockTransfers()", () =>
              writeContractAsync({
                address: addr, abi: GENESIS_PASS_ABI,
                functionName: "unlockTransfers",
              })
            );
          }}
        >
          Unlock Transfers (Irreversible)
        </ButtonV3>
        <p className="text-nasun-white/30 text-sm mt-2">
          Once unlocked, transfers cannot be re-locked. NFTs become tradeable on OpenSea.
        </p>
      </OuterBox>

      <TxStatus hash={lastTxHash} label={lastTxLabel} />
    </div>
  );
}

export function GenesisPassDropAdmin() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const addr = getContractAddress(chainId);

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="mb-8">
          <PageTitle as="h3" align="left">
            Genesis Pass Drop
          </PageTitle>
          <p className="text-nasun-white/60 -mt-6">
            On-chain contract management. Connect the owner wallet to execute transactions.
          </p>
        </div>

        {!isConnected ? (
          <OuterBox color="c5" padding="sm">
            <div className="text-center py-8">
              <p className="text-nasun-white/50 mb-4">Connect the contract owner wallet to manage the drop.</p>
              <ConnectButton />
            </div>
          </OuterBox>
        ) : !addr ? (
          <OuterBox color="c5" padding="sm">
            <p className="text-nasun-white/50 text-center py-8">
              Contract not deployed on this network (Chain ID: {chainId}).
            </p>
          </OuterBox>
        ) : (
          <div className="space-y-6">
            <ContractStatus addr={addr} />
            <AdminActions addr={addr} />
          </div>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
