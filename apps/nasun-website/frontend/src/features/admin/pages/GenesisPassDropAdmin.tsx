import { useState, useCallback } from "react";
import { useAccount, useBalance, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
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
import { useUserStore } from "@/store/userStore";
import { syncStageToSSM } from "@/services/genesisPassApi";

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

function ContractStatus({ addr, isSepolia }: { addr: `0x${string}`; isSepolia: boolean }) {
  const chainId = useChainId();
  const etherscanBase = chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io";
  const { data: balance } = useBalance({ address: addr, query: { refetchInterval: 10_000 } });
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
      args: [BigInt(s)], query: { refetchInterval: 30_000 },
    })
  );

  const stageNum = stage != null ? Number(stage) : 0;
  const deadlineNum = deadline != null ? Number(deadline) : 0;
  const deadlineStr = deadlineNum > 0
    ? new Date(deadlineNum * 1000).toLocaleString()
    : "No deadline";
  const totalMinted = mintedReads.reduce((sum, r) => sum + (r.data != null ? Number(r.data) : 0), 0);

  return (
    <OuterBox color="c5" padding="sm" className={`relative ${isSepolia ? "border-2 border-orange-500/40" : ""}`}>
      <NetworkBadge isSepolia={isSepolia} />
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
          <p className="text-nasun-white/80 text-lg">Balance</p>
          <p className="text-nasun-white text-2xl font-bold">
            {balance ? `${formatEther(balance.value)} ETH` : "-"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-5">
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
          <p className="text-nasun-white text-lg font-mono inline-flex items-center gap-2">
            {addr.slice(0, 8)}...{addr.slice(-6)}
            <a
              href={`${etherscanBase}/address/${addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-nasun-white/50 hover:text-nasun-white transition-colors"
              title="View on Etherscan"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </p>
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

function NetworkBadge({ isSepolia }: { isSepolia: boolean }) {
  if (isSepolia) return null;
  return (
    <div className="absolute -left-1 top-3 -translate-x-full hidden lg:block pr-3">
      <span className="text-teal-400 text-xs font-bold uppercase tracking-widest leading-tight text-right block">
        Ethereum
        <br />
        Mainnet
      </span>
    </div>
  );
}

function CurrentUriDisplay({ addr }: { addr: `0x${string}` }) {
  const { data: rawUri } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "uri" as any,
    args: [BigInt(1)], query: { refetchInterval: 30_000 },
  });
  // uri(1) returns "{baseURI}1.json" - strip the tokenId suffix to show base URI
  const baseUri = rawUri ? String(rawUri).replace(/\d+\.json$/, "") : null;
  const { data: contractUri } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "contractURI" as any,
    query: { refetchInterval: 30_000 },
  });

  return (
    <div className="bg-nasun-white/5 rounded-lg px-4 py-3 space-y-2">
      <div>
        <span className="text-nasun-white/60 text-base">Current Base URI: </span>
        <span className="text-nasun-white text-base font-mono break-all">
          {baseUri || "Not set"}
        </span>
      </div>
      <div>
        <span className="text-nasun-white/60 text-base">Current Contract URI: </span>
        <span className="text-nasun-white text-base font-mono break-all">
          {contractUri ? String(contractUri) : "Not set"}
        </span>
      </div>
    </div>
  );
}

function useCurrentStage(addr: `0x${string}`) {
  const { data } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "currentStage" as any,
    query: { refetchInterval: 10_000 },
  });
  return data != null ? Number(data) : 0;
}

function AdminActions({ addr, isSepolia }: { addr: `0x${string}`; isSepolia: boolean }) {
  const sepoliaBorder = `relative ${isSepolia ? "border-2 border-orange-500/40" : ""}`;
  const currentStage = useCurrentStage(addr);
  const { data: contractBalance } = useBalance({ address: addr, query: { refetchInterval: 10_000 } });
  const balanceStr = contractBalance ? formatEther(contractBalance.value) : "0";
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | undefined>();
  const [lastTxLabel, setLastTxLabel] = useState("");
  const [priceStage, setPriceStage] = useState("4");
  const [priceEth, setPriceEth] = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [uriInput, setUriInput] = useState("");
  const [contractUriInput, setContractUriInput] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmPhrase: string;
    variant: "danger" | "warning";
    onConfirm: () => void;
  } | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();

  const cognitoToken = useUserStore((s) => s.userData?.cognitoToken);

  const execTx = async (label: string, fn: () => Promise<`0x${string}`>, onSuccess?: () => void) => {
    try {
      setLastTxHash(undefined);
      setLastTxLabel(label);
      const hash = await fn();
      setLastTxHash(hash);
      onSuccess?.();
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
      <OuterBox color="c6" padding="sm" className={sepoliaBorder}>
        <NetworkBadge isSepolia={isSepolia} />
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
                    title: stage === 0 ? "Pause minting?" : `Advance to ${label}?`,
                    description: stage === 0
                      ? "WARNING: This effectively ENDS the current mint stage. Due to the forward-only stage design, you CANNOT return to the current stage after pausing. You can only advance to the next stage.\n\nOnly use this as an emergency brake or when you are done with the current stage."
                      : `This will advance the contract to ${label}.\n\nStage progression is forward-only and cannot be reversed (except to PAUSED).`,
                    confirmPhrase: label,
                    variant: stage === 0 ? "danger" : stage >= 3 ? "danger" : "warning",
                    onConfirm: () => execTx(
                      `setStage(${label})`,
                      () => writeContractAsync({
                        address: addr, abi: GENESIS_PASS_ABI,
                        functionName: "setStage", args: [stage],
                      }),
                      () => {
                        if (cognitoToken) {
                          syncStageToSSM(cognitoToken, stage)
                            .then(() => alert(`SSM synced to stage ${stage}`))
                            .catch((err) => alert(`SSM sync failed: ${err.message}`));
                        } else {
                          alert(`Stage set on-chain but SSM NOT synced (not logged in to Nasun). Run manually:\naws ssm put-parameter --name /nasun/genesis-pass/current-stage --value "${stage}" --type String --overwrite`);
                        }
                      },
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
      <OuterBox color="c6" padding="sm" className={sepoliaBorder}>
        <NetworkBadge isSepolia={isSepolia} />
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
              const normalized = priceEth.replace(",", ".");
              const parsed = parseFloat(normalized);
              if (isNaN(parsed) || parsed <= 0) {
                alert("Invalid price. Enter a positive number.");
                return;
              }
              if (parsed > 0.1) {
                alert(`Price ${normalized} ETH seems too high (max 0.1 ETH). Double-check the value.`);
                return;
              }
              const stageName = STAGE_NAMES[Number(priceStage)];
              const wei = parseEther(normalized);
              requestConfirm({
                title: `Set ${stageName} price to ${normalized} ETH?`,
                description: `This takes effect immediately for all users.\n\nNew price: ${normalized} ETH`,
                confirmPhrase: normalized,
                variant: "warning",
                onConfirm: () => execTx(`setStagePrice(${stageName}, ${normalized} ETH)`, () =>
                  writeContractAsync({
                    address: addr, abi: GENESIS_PASS_ABI,
                    functionName: "setStagePrice", args: [Number(priceStage), wei],
                  })
                ),
              });
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
      <OuterBox color="c6" padding="sm" className={sepoliaBorder}>
        <NetworkBadge isSepolia={isSepolia} />
        <h2 className="text-2xl font-semibold text-nasun-white mb-5">Mint Deadline</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-nasun-white/90 text-lg block mb-2">Deadline (local time)</label>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg [&::-webkit-calendar-picker-indicator]:invert"
            />
          </div>
          <ButtonV3
            variant="nw2"
            size="md"
            disabled={isPending || !deadlineInput}
            onClick={() => {
              const ts = Math.floor(new Date(deadlineInput).getTime() / 1000);
              const localStr = new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
              const utcStr = new Date(ts * 1000).toISOString();
              if (ts * 1000 <= Date.now()) {
                alert("Cannot set a deadline in the past. This would immediately block all minting.");
                return;
              }
              requestConfirm({
                title: "Set Mint Deadline",
                description: `Set mint deadline to:\n${localStr} (local time)\n${utcStr} (UTC)\n\nMinting will stop after this time.`,
                confirmPhrase: "SET DEADLINE",
                variant: "warning",
                onConfirm: () => execTx(`setMintDeadline(${utcStr})`, () =>
                  writeContractAsync({
                    address: addr, abi: GENESIS_PASS_ABI,
                    functionName: "setMintDeadline", args: [BigInt(ts)],
                  })
                ),
              });
            }}
          >
            Set Deadline
          </ButtonV3>
          <ButtonV3
            variant="nw3"
            size="md"
            disabled={isPending}
            onClick={() => {
              requestConfirm({
                title: "Remove Mint Deadline",
                description: "Remove mint deadline?\n\nMinting window will be unlimited until you set a new deadline.",
                confirmPhrase: "REMOVE DEADLINE",
                variant: "warning",
                onConfirm: () => execTx("Remove deadline", () =>
                  writeContractAsync({
                    address: addr, abi: GENESIS_PASS_ABI,
                    functionName: "setMintDeadline", args: [BigInt(0)],
                  })
                ),
              });
            }}
          >
            Remove Deadline
          </ButtonV3>
        </div>
      </OuterBox>

      {/* Metadata URI */}
      <OuterBox color="c6" padding="sm" className={sepoliaBorder}>
        <NetworkBadge isSepolia={isSepolia} />
        <h2 className="text-2xl font-semibold text-nasun-white mb-5">Metadata URI</h2>
        <CurrentUriDisplay addr={addr} />
        <div className="space-y-4 mt-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[20rem]">
              <label className="text-nasun-white/90 text-lg block mb-2">Base URI (token metadata)</label>
              <input
                type="text"
                value={uriInput}
                onChange={(e) => setUriInput(e.target.value)}
                placeholder="https://nasun.io/metadata/genesis-pass/"
                className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg w-full"
              />
            </div>
            <ButtonV3
              variant="nw2"
              size="md"
              disabled={isPending || !uriInput}
              onClick={() => {
                requestConfirm({
                  title: "Change Base URI",
                  description: `Set base URI to:\n${uriInput}\n\nAll token metadata URLs will change.\nTokens will resolve as: ${uriInput}{tokenId}.json`,
                  confirmPhrase: "SET URI",
                  variant: "danger",
                  onConfirm: () => execTx("setURI", () =>
                    writeContractAsync({
                      address: addr, abi: GENESIS_PASS_ABI,
                      functionName: "setURI", args: [uriInput],
                    })
                  ),
                });
              }}
            >
              Set URI
            </ButtonV3>
          </div>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[20rem]">
              <label className="text-nasun-white/90 text-lg block mb-2">Contract URI (collection metadata)</label>
              <input
                type="text"
                value={contractUriInput}
                onChange={(e) => setContractUriInput(e.target.value)}
                placeholder="https://nasun.io/metadata/genesis-pass/collection.json"
                className="bg-nasun-black border border-nasun-white/30 rounded px-4 py-3 text-nasun-white text-lg w-full"
              />
            </div>
            <ButtonV3
              variant="nw2"
              size="md"
              disabled={isPending || !contractUriInput}
              onClick={() => {
                requestConfirm({
                  title: "Change Contract URI",
                  description: `Set contract URI to:\n${contractUriInput}\n\nThis changes collection-level metadata on OpenSea and other marketplaces.`,
                  confirmPhrase: "SET CONTRACT URI",
                  variant: "danger",
                  onConfirm: () => execTx("setContractURI", () =>
                    writeContractAsync({
                      address: addr, abi: GENESIS_PASS_ABI,
                      functionName: "setContractURI", args: [contractUriInput],
                    })
                  ),
                });
              }}
            >
              Set Contract URI
            </ButtonV3>
          </div>
        </div>
        <p className="text-nasun-white/70 text-lg mt-4">
          Base URI resolves token metadata as {"{baseURI}{tokenId}.json"}. Contract URI is collection-level metadata for OpenSea.
        </p>
      </OuterBox>

      {/* Withdraw + Unlock */}
      <OuterBox color="c6" padding="sm" className={sepoliaBorder}>
        <NetworkBadge isSepolia={isSepolia} />
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
                description: `Withdraw ${balanceStr} ETH to:\n${withdrawAddr}\n\nThis is irreversible. Double-check the address and amount.`,
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

function useIsOwner(addr: `0x${string}` | undefined) {
  const { address: walletAddr } = useAccount();
  const { data: owner } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "owner" as any,
    query: { enabled: !!addr },
  });
  if (!addr || !walletAddr || !owner) return { isOwner: undefined, ownerAddr: owner as string | undefined };
  return {
    isOwner: (owner as string).toLowerCase() === walletAddr.toLowerCase(),
    ownerAddr: owner as string,
  };
}

export function GenesisPassDropAdmin() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const addr = getContractAddress(chainId);
  const { isOwner, ownerAddr } = useIsOwner(addr);

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
            {/* Network Warning Banner */}
            {chainId === 1 ? (
              <div className="rounded-xl border-2 border-teal-500/50 bg-teal-500/10 px-6 py-4 flex items-center gap-4">
                <span className="text-3xl">&#9670;</span>
                <div>
                  <p className="text-teal-400 text-xl font-bold">MAINNET</p>
                  <p className="text-teal-300 text-lg">You are connected to Ethereum Mainnet. All transactions use real ETH.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 px-6 py-4 flex items-center gap-4">
                <span className="text-3xl">&#128297;</span>
                <div>
                  <p className="text-amber-400 text-xl font-bold">SEPOLIA TESTNET</p>
                  <p className="text-amber-300 text-lg">You are connected to Sepolia testnet. Safe to experiment.</p>
                </div>
              </div>
            )}
            {isOwner === false && (
              <div className="rounded-xl border-2 border-red-500 bg-red-500/10 px-6 py-4 flex items-center gap-4">
                <span className="text-3xl">&#128683;</span>
                <div>
                  <p className="text-red-400 text-xl font-bold">NOT THE OWNER</p>
                  <p className="text-red-300 text-lg">
                    Your wallet is not the contract owner. Transactions will fail.
                    Owner: <span className="font-mono">{ownerAddr?.slice(0, 8)}...{ownerAddr?.slice(-6)}</span>
                  </p>
                </div>
              </div>
            )}
            <ContractStatus addr={addr} isSepolia={chainId !== 1} />
            {isOwner === false ? null : <AdminActions addr={addr} isSepolia={chainId !== 1} />}
          </div>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
