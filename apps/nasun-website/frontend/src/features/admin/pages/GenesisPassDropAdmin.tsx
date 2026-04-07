import { useState, useCallback } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther, isAddress } from "viem";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
    <div className="mt-4 text-lg">
      {isLoading && <span className="text-amber-400 font-medium">Pending: {label}...</span>}
      {isSuccess && <span className="text-green-400 font-medium">Success: {label}</span>}
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

  const mintedReads = [1,2,3,4,5,6,7].map(id =>
    useReadContract({
      address: addr, abi: GENESIS_PASS_ABI, functionName: "totalMinted" as any,
      args: [BigInt(id)], query: { refetchInterval: 10_000 },
    })
  );

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
      <h2 className="text-2xl font-semibold text-nasun-white mb-5">Contract Status</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <div>
          <p className="text-nasun-white/80 text-lg">Stage</p>
          <p className="text-nasun-white text-2xl font-bold">{STAGE_NAMES[stageNum] || stageNum}</p>
        </div>
        <div>
          <p className="text-nasun-white/80 text-lg">Current Price</p>
          <p className="text-nasun-white text-2xl font-bold">
            {stageNum === 1 ? "Free" : price != null ? `${formatEther(price as bigint)} ETH` : "-"}
          </p>
        </div>
        <div>
          <p className="text-nasun-white/80 text-lg">Total Minted</p>
          <p className="text-nasun-white text-2xl font-bold">{totalMinted}</p>
        </div>
        <div>
          <p className="text-nasun-white/80 text-lg">Transfers</p>
          <p className={`text-2xl font-bold ${locked ? "text-green-400" : "text-amber-400"}`}>
            {locked ? "Unlocked" : "Locked"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-5">
        <div>
          <p className="text-nasun-white/80 text-lg">Deadline</p>
          <p className="text-nasun-white text-lg">{deadlineStr}</p>
        </div>
        <div>
          <p className="text-nasun-white/80 text-lg">HighWaterMark</p>
          <p className="text-nasun-white text-lg">{hwm != null ? STAGE_NAMES[Number(hwm)] || String(hwm) : "-"}</p>
        </div>
        <div>
          <p className="text-nasun-white/80 text-lg">Contract</p>
          <p className="text-nasun-white text-lg font-mono">{addr.slice(0, 8)}...{addr.slice(-6)}</p>
        </div>
      </div>

      {/* Per-type minted */}
      <div className="mt-5">
        <p className="text-nasun-white/80 text-lg mb-3">Minted per Type</p>
        <div className="flex gap-3 flex-wrap">
          {mintedReads.map((r, i) => (
            <div key={i} className="bg-nasun-white/10 rounded px-4 py-2">
              <span className="text-nasun-white/70 text-lg">#{i + 1}: </span>
              <span className="text-nasun-white text-lg font-bold">{r.data != null ? Number(r.data) : 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stage prices */}
      <div className="mt-5">
        <p className="text-nasun-white/80 text-lg mb-3">Stage Prices</p>
        <div className="flex gap-3 flex-wrap">
          {["GTD", "FCFS", "PUBLIC"].map((name, i) => (
            <div key={name} className="bg-nasun-white/10 rounded px-4 py-2">
              <span className="text-nasun-white/70 text-lg">{name}: </span>
              <span className="text-nasun-white text-lg font-bold">
                {priceReads[i].data != null ? `${formatEther(priceReads[i].data as bigint)} ETH` : "Not set"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </OuterBox>
  );
}

// 2-step confirmation dialog for irreversible operations
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmPhrase,
  variant = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmPhrase: string;
  variant?: "danger" | "warning";
}) {
  const [typed, setTyped] = useState("");
  const matched = typed.trim().toUpperCase() === confirmPhrase.toUpperCase();

  const handleClose = () => { setTyped(""); onClose(); };
  const handleConfirm = () => { setTyped(""); onConfirm(); };

  const borderColor = variant === "danger" ? "border-red-500/50" : "border-amber-500/50";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className={`max-w-md border ${borderColor}`}>
        <DialogHeader>
          <DialogTitle className={`text-xl ${variant === "danger" ? "text-red-400" : "text-amber-400"}`}>
            {title}
          </DialogTitle>
          <DialogDescription className="text-nasun-white/80 text-base whitespace-pre-line">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3">
          <p className="text-base text-nasun-white/70 mb-2">
            Type <span className="font-mono font-bold text-nasun-white">{confirmPhrase}</span> to confirm:
          </p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmPhrase}
            className="w-full bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg font-mono"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <ButtonV3 variant="nw3" size="sm" onClick={handleClose}>Cancel</ButtonV3>
          <ButtonV3
            variant={variant === "danger" ? "red" : "c1-gradient"}
            size="sm"
            disabled={!matched}
            onClick={handleConfirm}
          >
            Confirm
          </ButtonV3>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useCurrentStage(addr: `0x${string}`) {
  const { data } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "currentStage" as any,
    query: { refetchInterval: 10_000 },
  });
  return data != null ? Number(data) : 0;
}

function AdminActions({ addr }: { addr: `0x${string}` }) {
  const currentStage = useCurrentStage(addr);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | undefined>();
  const [lastTxLabel, setLastTxLabel] = useState("");
  const [priceStage, setPriceStage] = useState("4");
  const [priceEth, setPriceEth] = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmPhrase: string;
    variant: "danger" | "warning";
    onConfirm: () => void;
  } | null>(null);

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

  const requestConfirm = useCallback((opts: {
    title: string;
    description: string;
    confirmPhrase: string;
    variant: "danger" | "warning";
    onConfirm: () => void;
  }) => {
    setConfirmDialog(opts);
  }, []);

  const stages = [
    { label: "PAUSED", stage: 0 },
    { label: "FREE_MINT", stage: 1 },
    { label: "GTD", stage: 2 },
    { label: "FCFS", stage: 3 },
    { label: "PUBLIC", stage: 4 },
  ];

  return (
    <div className="space-y-5">
      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }}
        title={confirmDialog?.title ?? ""}
        description={confirmDialog?.description ?? ""}
        confirmPhrase={confirmDialog?.confirmPhrase ?? ""}
        variant={confirmDialog?.variant ?? "danger"}
      />

      {/* Stage Control */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-2xl font-semibold text-nasun-white mb-5">Stage Control</h2>
        <div className="flex flex-wrap gap-3">
          {stages.map(({ label, stage }) => {
            const isCurrent = stage === currentStage;
            // Cannot go backward (except PAUSED which is always allowed)
            const isBackward = stage !== 0 && stage > 0 && stage <= currentStage && !isCurrent;
            const isDisabled = isPending || isCurrent || isBackward;
            return (
              <ButtonV3
                key={stage}
                variant={isCurrent ? "c1-gradient" : isBackward ? "nw3" : "nw2"}
                size="md"
                disabled={isDisabled}
                className={isCurrent ? "ring-2 ring-nasun-white ring-offset-2 ring-offset-nasun-black" : isBackward ? "opacity-40 cursor-not-allowed" : ""}
                onClick={() => {
                  requestConfirm({
                    title: `Advance to ${label}?`,
                    description: stage === 0
                      ? "This will pause all minting. You can resume later."
                      : `This will advance the contract to ${label}.\n\nStage progression is forward-only and cannot be reversed (except to PAUSED).`,
                    confirmPhrase: label,
                    variant: stage >= 3 ? "danger" : "warning",
                    onConfirm: () => execTx(`setStage(${label})`, () =>
                      writeContractAsync({
                        address: addr, abi: GENESIS_PASS_ABI,
                        functionName: "setStage", args: [stage],
                      })
                    ),
                  });
                }}
              >
                {isCurrent ? `${label} (Current)` : label}
              </ButtonV3>
            );
          })}
        </div>
        <p className="text-nasun-white/70 text-lg mt-4">
          Forward-only. Cannot go back to a previous stage (except PAUSED).
        </p>
      </OuterBox>

      {/* Price Adjustment */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-2xl font-semibold text-nasun-white mb-5">Price Adjustment</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-nasun-white/90 text-lg block mb-2">Stage</label>
            <select
              value={priceStage}
              onChange={(e) => setPriceStage(e.target.value)}
              className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg"
            >
              <option value="2">GTD</option>
              <option value="3">FCFS</option>
              <option value="4">PUBLIC</option>
            </select>
          </div>
          <div>
            <label className="text-nasun-white/90 text-lg block mb-2">Price (ETH)</label>
            <input
              type="text"
              value={priceEth}
              onChange={(e) => setPriceEth(e.target.value)}
              placeholder="0.003"
              className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg w-36"
            />
          </div>
          <ButtonV3
            variant="c1-gradient"
            size="md"
            disabled={isPending || !priceEth}
            onClick={() => {
              const stageName = STAGE_NAMES[Number(priceStage)];
              if (!confirm(`Set ${stageName} price to ${priceEth} ETH?\n\nThis takes effect immediately for all users.`)) return;
              const wei = parseEther(priceEth.replace(",", "."));
              execTx(`setStagePrice(${stageName}, ${priceEth} ETH)`, () =>
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
        <p className="text-nasun-white/70 text-lg mt-4">
          Takes effect immediately. No need to pause. Users see updated price within 15 seconds.
        </p>
      </OuterBox>

      {/* Deadline */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-2xl font-semibold text-nasun-white mb-5">Mint Deadline</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-nasun-white/90 text-lg block mb-2">Deadline (UTC datetime)</label>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg"
            />
          </div>
          <ButtonV3
            variant="nw2"
            size="md"
            disabled={isPending || !deadlineInput}
            onClick={() => {
              const ts = Math.floor(new Date(deadlineInput + "Z").getTime() / 1000);
              const dateStr = new Date(ts * 1000).toISOString();
              if (!confirm(`Set mint deadline to:\n${dateStr}\n\nMinting will stop after this time.`)) return;
              execTx(`setMintDeadline(${dateStr})`, () =>
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
            size="md"
            disabled={isPending}
            onClick={() => {
              if (!confirm("Remove mint deadline?\n\nMinting window will be unlimited until you set a new deadline.")) return;
              execTx("Remove deadline", () =>
                writeContractAsync({
                  address: addr, abi: GENESIS_PASS_ABI,
                  functionName: "setMintDeadline", args: [BigInt(0)],
                })
              );
            }}
          >
            Remove Deadline
          </ButtonV3>
        </div>
      </OuterBox>

      {/* Withdraw + Unlock */}
      <OuterBox color="c6" padding="sm">
        <h2 className="text-2xl font-semibold text-nasun-white mb-5">Withdraw + Transfer Unlock</h2>
        <div className="flex items-end gap-4 flex-wrap mb-4">
          <div>
            <label className="text-nasun-white/90 text-lg block mb-2">Withdraw to address</label>
            <input
              type="text"
              value={withdrawAddr}
              onChange={(e) => setWithdrawAddr(e.target.value)}
              placeholder="0x..."
              className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg w-[28rem]"
            />
          </div>
          <ButtonV3
            variant="c1-gradient"
            size="md"
            disabled={isPending || !withdrawAddr || !isAddress(withdrawAddr)}
            onClick={() => {
              requestConfirm({
                title: "Withdraw All ETH",
                description: `Withdraw all contract ETH to:\n${withdrawAddr}\n\nThis is irreversible. Double-check the address.`,
                confirmPhrase: "WITHDRAW",
                variant: "danger",
                onConfirm: () => execTx(`withdrawTo(${withdrawAddr.slice(0, 8)}...)`, () =>
                  writeContractAsync({
                    address: addr, abi: GENESIS_PASS_ABI,
                    functionName: "withdrawTo", args: [withdrawAddr as `0x${string}`],
                  })
                ),
              });
            }}
          >
            Withdraw All ETH
          </ButtonV3>
        </div>
        <ButtonV3
          variant="red"
          size="md"
          disabled={isPending}
          onClick={() => {
            requestConfirm({
              title: "Unlock Transfers Permanently",
              description: "This is irreversible. Once unlocked, NFT transfers can NEVER be re-locked.\n\nAll NFTs become immediately tradeable on OpenSea and other marketplaces.",
              confirmPhrase: "UNLOCK",
              variant: "danger",
              onConfirm: () => execTx("unlockTransfers()", () =>
                writeContractAsync({
                  address: addr, abi: GENESIS_PASS_ABI,
                  functionName: "unlockTransfers",
                })
              ),
            });
          }}
        >
          Unlock Transfers (Irreversible)
        </ButtonV3>
        <p className="text-nasun-white/70 text-lg mt-4">
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
          <p className="text-nasun-white/80 text-xl -mt-6">
            On-chain contract management. Connect the owner wallet to execute transactions.
          </p>
        </div>

        {!isConnected ? (
          <OuterBox color="c5" padding="sm">
            <div className="text-center py-8">
              <p className="text-nasun-white/80 text-xl mb-4">Connect the contract owner wallet to manage the drop.</p>
              <ConnectButton />
            </div>
          </OuterBox>
        ) : !addr ? (
          <OuterBox color="c5" padding="sm">
            <p className="text-nasun-white/80 text-xl text-center py-8">
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
