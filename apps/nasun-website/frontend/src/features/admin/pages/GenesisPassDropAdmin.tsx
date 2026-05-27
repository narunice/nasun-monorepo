/* eslint-disable react-hooks/rules-of-hooks --
 * Genesis Pass drop is decommissioned (project_genesis_pass_decommission).
 * This admin page calls useReadContract inside .map() callbacks and a helper
 * function — legitimate hook-rule violations, but the page is slated for
 * read-only reduction and rewriting it now is wasted effort. Disable file-wide.
 */
import { useReadContract, useBalance } from "wagmi";
import { formatEther } from "viem";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { GENESIS_PASS_ABI, GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";

const STAGE_NAMES: Record<number, string> = {
  0: "PAUSED", 1: "FREE_MINT", 2: "GTD_ALLOWLIST", 3: "FCFS_ALLOWLIST", 4: "PUBLIC",
};

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

function ContractStatus({ addr, isSepolia }: { addr: `0x${string}`; isSepolia: boolean }) {
  const etherscanBase = isSepolia ? "https://sepolia.etherscan.io" : "https://etherscan.io";
  const { data: balance } = useBalance({ address: addr, query: { refetchInterval: 30_000 } });
  const read = (fn: string) => useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: fn as any,
    query: { refetchInterval: 30_000 },
  });

  const { data: stage } = read("currentStage");
  const { data: price } = read("currentMintPrice");
  const { data: deadline } = read("mintDeadline");
  const { data: locked } = read("transfersUnlocked");
  const { data: hwm } = read("highWaterMark");

  const mintedReads = [1,2,3,4,5,6,7,8].map(id =>
    useReadContract({
      address: addr, abi: GENESIS_PASS_ABI, functionName: "totalMinted" as any,
      args: [BigInt(id)], query: { refetchInterval: 30_000 },
    })
  );

  const priceReads = [2,3,4].map(s =>
    useReadContract({
      address: addr, abi: GENESIS_PASS_ABI, functionName: "mintPricePerStage" as any,
      args: [BigInt(s)], query: { refetchInterval: 60_000 },
    })
  );

  const stageNum = stage != null ? Number(stage) : 0;
  const deadlineNum = deadline != null ? Number(deadline) : 0;
  const deadlineStr = deadlineNum > 0
    ? new Date(deadlineNum * 1000).toLocaleString("en-US")
    : "No deadline";
  const totalMinted = mintedReads.reduce((sum, r) => sum + (r.data != null ? Number(r.data) : 0), 0);

  return (
    <OuterBox color="c5" padding="sm" className={`relative ${isSepolia ? "border-2 border-orange-500/40" : ""}`}>
      <NetworkBadge isSepolia={isSepolia} />
      <h2 className="text-2xl font-semibold text-nasun-white mb-5">Contract State</h2>
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

      <div className="mt-5">
        <p className="text-nasun-white/80 text-lg mb-3">Metadata URIs</p>
        <CurrentUriDisplay addr={addr} />
      </div>
    </OuterBox>
  );
}

function CurrentUriDisplay({ addr }: { addr: `0x${string}` }) {
  const { data: rawUri } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "uri" as any,
    args: [BigInt(1)], query: { refetchInterval: 60_000 },
  });
  const baseUri = rawUri ? String(rawUri).replace(/\d+\.json$/, "") : null;
  const { data: contractUri } = useReadContract({
    address: addr, abi: GENESIS_PASS_ABI, functionName: "contractURI" as any,
    query: { refetchInterval: 60_000 },
  });

  return (
    <div className="bg-nasun-white/5 rounded-lg px-4 py-3 space-y-2">
      <div>
        <span className="text-nasun-white/60 text-base">Base URI: </span>
        <span className="text-nasun-white text-base font-mono break-all">{baseUri || "Not set"}</span>
      </div>
      <div>
        <span className="text-nasun-white/60 text-base">Contract URI: </span>
        <span className="text-nasun-white text-base font-mono break-all">{contractUri ? String(contractUri) : "Not set"}</span>
      </div>
    </div>
  );
}

const MAINNET_ADDR = GENESIS_PASS_ADDRESSES[1] as `0x${string}`;
const SEPOLIA_ADDR = GENESIS_PASS_ADDRESSES[11155111] as `0x${string}`;

export function GenesisPassDropAdmin() {
  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="mb-8">
          <PageTitle as="h3" align="left">Genesis Pass Drop</PageTitle>
          <p className="text-nasun-white/80 text-xl -mt-6">
            Drop ended. Read-only reference.
          </p>
        </div>

        <div className="rounded-xl border border-nasun-white/20 bg-nasun-white/5 px-6 py-4 mb-6">
          <p className="text-nasun-white text-xl font-semibold mb-1">Drop Complete</p>
          <p className="text-nasun-white/70 text-lg">
            The Genesis Pass drop has permanently ended. Contract admin controls have been removed.
          </p>
        </div>

        <OuterBox color="c5" padding="sm" className="mb-6">
          <h2 className="text-2xl font-semibold text-nasun-white mb-4">Contract Addresses</h2>
          <div className="space-y-3">
            <div>
              <span className="text-nasun-white/60 text-base">Mainnet (Ethereum): </span>
              <a
                href={`https://etherscan.io/address/${MAINNET_ADDR}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-nasun-c4 font-mono text-base underline break-all"
              >
                {MAINNET_ADDR}
              </a>
            </div>
            {SEPOLIA_ADDR && (
              <div>
                <span className="text-nasun-white/60 text-base">Sepolia (Testnet): </span>
                <a
                  href={`https://sepolia.etherscan.io/address/${SEPOLIA_ADDR}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c4 font-mono text-base underline break-all"
                >
                  {SEPOLIA_ADDR}
                </a>
              </div>
            )}
          </div>
        </OuterBox>

        <ContractStatus addr={MAINNET_ADDR} isSepolia={false} />
      </SectionLayout>
    </AdminLayout>
  );
}
