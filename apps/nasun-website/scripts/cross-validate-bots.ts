#!/usr/bin/env npx tsx
/**
 * Alliance NFT Bot Cross-Validation
 *
 * Conservative approach: ANY human signal clears the wallet.
 * Better to miss bots than flag real humans.
 *
 * Signals (on-chain + off-chain):
 *   1-4. Governance voting, BetaAccess, Baram, Lottery/Scratchcard events
 *   5.   Transaction count > 5
 *   6-7. X / Telegram linked (DynamoDB UserProfiles)
 *   8.   Ecosystem activation (DynamoDB)
 *   9.   Battalion NFT whitelist (DynamoDB)
 *  10.   Genesis Pass allowlist (DynamoDB)
 *  11.   Referral activity (DynamoDB)
 *
 * Usage: npx tsx scripts/cross-validate-bots.ts
 */

import { execSync } from "child_process";

const RPC_URL = "https://rpc.devnet.nasun.io";
const AWS_PROFILE = "nasun-prod";
const AWS_REGION = "ap-northeast-2";

const ALLIANCE_PACKAGE_ID =
  "0x2f2f9e1a1683462af44d3da1b5148f8671d446dbb913d5348efaf2f08819ba5b";
const ALLIANCE_EVENT_TYPE = `${ALLIANCE_PACKAGE_ID}::alliance_nft::AllianceMinted`;
const SPIKE_THRESHOLD = 2.0;

const ACTIVITY_EVENTS = [
  {
    name: "VoteRegistered",
    type: "0x17df8431dd61bcdfc0dae120c915150634edecb911bf7368d0af43e2bbd69c5a::proposal::VoteRegistered",
    field: "voter",
  },
  {
    name: "MultiChoiceVote",
    type: "0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a::multi_choice_proposal::MultiChoiceVoteRegistered",
    field: "voter",
  },
  {
    name: "BetaAccessMinted",
    type: "0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9::beta_access::BetaAccessMinted",
    field: "recipient",
  },
  {
    name: "BaramRequest",
    type: "0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9::baram::RequestCreated",
    field: "sender",
  },
  {
    name: "LotteryTicket",
    type: "0xeb79d7421090eccc5f912f20407c67b8052c7fbe1efea39bf9b548ccea46819c::lottery::TicketPurchased",
    field: "buyer",
  },
  {
    name: "ScratchCard",
    type: "0x2af30b79f00f8cf01cbf5c6a1ca58e20e80be0c7da2e99af0a4f80e23fd7a4f5::scratchcard::ScratchCardPurchased",
    field: "buyer",
  },
];

interface WalletEvidence {
  wallet: string;
  cleared: boolean;
  reasons: string[];
}

// ========== RPC ==========

let rpcReqId = 0;

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const id = ++rpcReqId;
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) throw new Error(`RPC ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

interface EventPage {
  data: Array<{
    id: { txDigest: string; eventSeq: string };
    timestampMs: string;
    parsedJson: Record<string, string>;
  }>;
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

// ========== Phase 1: Spike wallets ==========

async function collectSpikeWallets(): Promise<Set<string>> {
  process.stderr.write("  Fetching AllianceMinted events...\n");

  interface MintEv { recipient: string; imageIndex: number; timestampMs: number }
  const events: MintEv[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null = null;

  for (let p = 0; p < 500; p++) {
    const r = await rpcCall<EventPage>("suix_queryEvents", [
      { MoveEventType: ALLIANCE_EVENT_TYPE }, cursor, 50, false,
    ]);
    for (const ev of r.data) {
      events.push({
        recipient: ev.parsedJson.recipient,
        imageIndex: Number(ev.parsedJson.image_index),
        timestampMs: Number(ev.timestampMs),
      });
    }
    if (!r.hasNextPage) break;
    cursor = r.nextCursor;
    if ((p + 1) % 50 === 0) process.stderr.write(`    ${events.length} events...\n`);
  }
  process.stderr.write(`  Total: ${events.length} events\n`);

  // Hourly spike detection
  const hourlyC = new Map<string, number>();
  const hourlyEvs = new Map<string, MintEv[]>();
  for (const e of events) {
    const h = new Date(e.timestampMs).toISOString().slice(0, 13) + ":00Z";
    if (e.imageIndex === 2) hourlyC.set(h, (hourlyC.get(h) || 0) + 1);
    if (!hourlyEvs.has(h)) hourlyEvs.set(h, []);
    hourlyEvs.get(h)!.push(e);
  }

  const vals = [...hourlyC.values()].filter((c) => c > 0);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const thresh = mean * SPIKE_THRESHOLD;

  const wallets = new Set<string>();
  for (const [h, cnt] of hourlyC) {
    if (cnt > thresh) {
      for (const e of hourlyEvs.get(h)!) {
        if (e.imageIndex === 2) wallets.add(e.recipient);
      }
    }
  }
  return wallets;
}

// ========== Phase 2: On-chain activity ==========

async function collectOnChainActivity(): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();

  for (const ev of ACTIVITY_EVENTS) {
    process.stderr.write(`  ${ev.name}...`);
    let cursor: { txDigest: string; eventSeq: string } | null = null;
    let count = 0;

    for (let p = 0; p < 200; p++) {
      try {
        const r = await rpcCall<EventPage>("suix_queryEvents", [
          { MoveEventType: ev.type }, cursor, 50, false,
        ]);
        for (const e of r.data) {
          const w = e.parsedJson[ev.field];
          if (w) {
            if (!result.has(w)) result.set(w, new Set());
            result.get(w)!.add(ev.name);
            count++;
          }
        }
        if (!r.hasNextPage) break;
        cursor = r.nextCursor;
      } catch {
        break;
      }
    }
    process.stderr.write(` ${count}\n`);
  }
  return result;
}

async function checkTxCounts(wallets: string[], minTx: number): Promise<Set<string>> {
  const active = new Set<string>();
  const batch = 20;

  for (let i = 0; i < wallets.length; i += batch) {
    const slice = wallets.slice(i, i + batch);
    await Promise.all(
      slice.map(async (w) => {
        try {
          const r = await rpcCall<{ data: unknown[] }>("suix_queryTransactionBlocks", [
            { filter: { FromAddress: w } }, null, minTx + 1, false,
          ]);
          if (r.data.length > minTx) active.add(w);
        } catch { /* skip */ }
      }),
    );
    if ((i + batch) % 500 === 0) {
      process.stderr.write(`    ${Math.min(i + batch, wallets.length)}/${wallets.length}\n`);
    }
  }
  return active;
}

// ========== Phase 3: DynamoDB ==========

function dynamoScanAll(tableName: string, opts: {
  projection: string;
  filter?: string;
  exprNames?: Record<string, string>;
  exprValues?: Record<string, unknown>;
}): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  let startKey: string | undefined;

  for (let page = 0; page < 100; page++) {
    let cmd = `aws dynamodb scan --table-name "${tableName}" --projection-expression "${opts.projection}" --region ${AWS_REGION} --profile ${AWS_PROFILE} --no-paginate`;

    if (opts.filter) cmd += ` --filter-expression '${opts.filter}'`;
    if (opts.exprNames) cmd += ` --expression-attribute-names '${JSON.stringify(opts.exprNames)}'`;
    if (opts.exprValues) cmd += ` --expression-attribute-values '${JSON.stringify(opts.exprValues)}'`;
    if (startKey) cmd += ` --exclusive-start-key '${startKey}'`;

    try {
      const out = execSync(cmd, { encoding: "utf-8", timeout: 60_000 });
      const parsed = JSON.parse(out);
      if (parsed.Items) items.push(...parsed.Items);
      if (!parsed.LastEvaluatedKey) break;
      startKey = JSON.stringify(parsed.LastEvaluatedKey);
    } catch {
      break;
    }
  }
  return items;
}

function extractS(item: Record<string, unknown>, field: string): string | undefined {
  const v = item[field] as { S?: string } | undefined;
  return v?.S;
}

function getAllianceMapping(): Map<string, string> {
  process.stderr.write("  nasun-alliance-mint...");
  const items = dynamoScanAll("nasun-alliance-mint", {
    projection: "identityId, walletAddress, #s",
    exprNames: { "#s": "status" },
    filter: "#s = :m",
    exprValues: { ":m": { S: "MINTED" } },
  });
  const map = new Map<string, string>();
  for (const it of items) {
    const w = extractS(it, "walletAddress");
    const id = extractS(it, "identityId");
    if (w && id) map.set(w, id);
  }
  process.stderr.write(` ${map.size} records\n`);
  return map;
}

function getXLinkedIdentities(): Set<string> {
  process.stderr.write("  UserProfiles (X linked)...");
  const items = dynamoScanAll("UserProfiles", {
    projection: "identityId",
    filter: "attribute_exists(twitterHandle)",
  });
  const ids = new Set<string>();
  for (const it of items) { const id = extractS(it, "identityId"); if (id) ids.add(id); }
  process.stderr.write(` ${ids.size}\n`);
  return ids;
}

function getTelegramLinkedIdentities(): Set<string> {
  process.stderr.write("  UserProfiles (Telegram)...");
  const items = dynamoScanAll("UserProfiles", {
    projection: "identityId",
    filter: "isTelegramMember = :t",
    exprValues: { ":t": { BOOL: true } },
  });
  const ids = new Set<string>();
  for (const it of items) { const id = extractS(it, "identityId"); if (id) ids.add(id); }
  process.stderr.write(` ${ids.size}\n`);
  return ids;
}

function getEcosystemActivations(): Set<string> {
  process.stderr.write("  nasun-ecosystem-activations...");
  const items = dynamoScanAll("nasun-ecosystem-activations", {
    projection: "identityId",
    filter: "#s = :a",
    exprNames: { "#s": "status" },
    exprValues: { ":a": { S: "ACTIVE" } },
  });
  const ids = new Set<string>();
  for (const it of items) { const id = extractS(it, "identityId"); if (id) ids.add(id); }
  process.stderr.write(` ${ids.size}\n`);
  return ids;
}

function getBattalionWallets(): Set<string> {
  process.stderr.write("  nasun-nft-whitelist...");
  const items = dynamoScanAll("nasun-nft-whitelist", { projection: "walletAddress" });
  const ws = new Set<string>();
  for (const it of items) { const w = extractS(it, "walletAddress"); if (w) ws.add(w); }
  process.stderr.write(` ${ws.size}\n`);
  return ws;
}

function getGenesisPassWallets(): Set<string> {
  process.stderr.write("  nasun-genesis-pass-allowlist...");
  const items = dynamoScanAll("nasun-genesis-pass-allowlist", { projection: "walletAddress" });
  const ws = new Set<string>();
  for (const it of items) { const w = extractS(it, "walletAddress"); if (w) ws.add(w); }
  process.stderr.write(` ${ws.size}\n`);
  return ws;
}

function getReferrerIdentities(): Set<string> {
  process.stderr.write("  nasun-referrals...");
  const items = dynamoScanAll("nasun-referrals", { projection: "referrerIdentityId" });
  const ids = new Set<string>();
  for (const it of items) { const id = extractS(it, "referrerIdentityId"); if (id) ids.add(id); }
  process.stderr.write(` ${ids.size}\n`);
  return ids;
}

// ========== Main ==========

async function main() {
  console.log("=== Alliance NFT Bot Cross-Validation ===");
  console.log("Policy: ANY human signal clears the wallet\n");

  // Phase 1
  console.log("[1] Identifying spike-period Contractor wallets...");
  const spikeWallets = await collectSpikeWallets();
  console.log(`  Suspects: ${spikeWallets.size}\n`);

  const evidence = new Map<string, WalletEvidence>();
  for (const w of spikeWallets) {
    evidence.set(w, { wallet: w, cleared: false, reasons: [] });
  }

  // Phase 2: On-chain
  console.log("[2] On-chain activity scan...");
  const onChainActivity = await collectOnChainActivity();

  let cnt = 0;
  for (const [w, ev] of evidence) {
    const acts = onChainActivity.get(w);
    if (acts && acts.size > 0) {
      ev.cleared = true;
      ev.reasons.push(`on-chain: ${[...acts].join(", ")}`);
      cnt++;
    }
  }
  console.log(`  Cleared by on-chain events: ${cnt}\n`);

  // Phase 2b: Tx count
  const remaining = [...evidence.values()].filter((e) => !e.cleared).map((e) => e.wallet);
  console.log(`[3] Transaction count check (${remaining.length} wallets, >5 txs)...`);
  const activeTx = await checkTxCounts(remaining, 5);

  cnt = 0;
  for (const w of activeTx) {
    const ev = evidence.get(w)!;
    if (!ev.cleared) { ev.cleared = true; ev.reasons.push("on-chain: >5 transactions"); cnt++; }
  }
  console.log(`  Cleared by tx count: ${cnt}\n`);

  // Phase 3: DynamoDB
  console.log("[4] DynamoDB cross-reference...");

  const allianceMap = getAllianceMapping();
  const walletToId = new Map<string, string>();
  for (const [w, ev] of evidence) {
    if (!ev.cleared) {
      const id = allianceMap.get(w);
      if (id) walletToId.set(w, id);
    }
  }
  console.log(`  Mapped ${walletToId.size} suspect wallets to identityIds\n`);

  // Signal 6: X
  const xLinked = getXLinkedIdentities();
  cnt = 0;
  for (const [w, id] of walletToId) {
    const ev = evidence.get(w)!;
    if (!ev.cleared && xLinked.has(id)) { ev.cleared = true; ev.reasons.push("social: X linked"); cnt++; }
  }
  console.log(`  Cleared by X: ${cnt}`);

  // Signal 7: Telegram
  const tgLinked = getTelegramLinkedIdentities();
  cnt = 0;
  for (const [w, id] of walletToId) {
    const ev = evidence.get(w)!;
    if (!ev.cleared && tgLinked.has(id)) { ev.cleared = true; ev.reasons.push("social: Telegram linked"); cnt++; }
  }
  console.log(`  Cleared by Telegram: ${cnt}`);

  // Signal 8: Ecosystem
  const ecoActive = getEcosystemActivations();
  cnt = 0;
  for (const [w, id] of walletToId) {
    const ev = evidence.get(w)!;
    if (!ev.cleared && ecoActive.has(id)) { ev.cleared = true; ev.reasons.push("ecosystem: activated"); cnt++; }
  }
  console.log(`  Cleared by ecosystem: ${cnt}`);

  // Signal 9: Battalion
  const battalionWs = getBattalionWallets();
  cnt = 0;
  for (const [w, ev] of evidence) {
    if (!ev.cleared && battalionWs.has(w)) { ev.cleared = true; ev.reasons.push("battalion: whitelist"); cnt++; }
  }
  console.log(`  Cleared by Battalion: ${cnt}`);

  // Signal 10: Genesis Pass
  const genesisWs = getGenesisPassWallets();
  cnt = 0;
  for (const [w, ev] of evidence) {
    if (!ev.cleared && genesisWs.has(w)) { ev.cleared = true; ev.reasons.push("genesis-pass: allowlist"); cnt++; }
  }
  console.log(`  Cleared by Genesis Pass: ${cnt}`);

  // Signal 11: Referrals
  const referrers = getReferrerIdentities();
  cnt = 0;
  for (const [w, id] of walletToId) {
    const ev = evidence.get(w)!;
    if (!ev.cleared && referrers.has(id)) { ev.cleared = true; ev.reasons.push("referral: active referrer"); cnt++; }
  }
  console.log(`  Cleared by referrals: ${cnt}`);

  // ========== Results ==========
  const cleared = [...evidence.values()].filter((e) => e.cleared);
  const bots = [...evidence.values()].filter((e) => !e.cleared);

  console.log("\n" + "=".repeat(60));
  console.log("CROSS-VALIDATION RESULTS");
  console.log("=".repeat(60));
  console.log(`  Initial suspects:         ${spikeWallets.size}`);
  console.log(`  Cleared (human evidence): ${cleared.length}`);
  console.log(`  Confirmed bots:           ${bots.length}`);
  console.log(`  FP removed:               ${((cleared.length / spikeWallets.size) * 100).toFixed(1)}%`);

  // Breakdown
  const reasons = new Map<string, number>();
  for (const e of cleared) {
    for (const r of e.reasons) {
      const cat = r.split(":")[0];
      reasons.set(cat, (reasons.get(cat) || 0) + 1);
    }
  }
  console.log("\nClearance breakdown:");
  for (const [r, c] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r}: ${c}`);
  }

  // Output
  console.log("\n--- CLEARED WALLETS ---");
  for (const e of cleared.sort((a, b) => a.wallet.localeCompare(b.wallet))) {
    console.log(`${e.wallet} | ${e.reasons.join("; ")}`);
  }

  console.log("\n--- CONFIRMED BOT WALLETS ---");
  for (const e of bots.sort((a, b) => a.wallet.localeCompare(b.wallet))) {
    console.log(e.wallet);
  }

  console.log(`\n=== Cross-Validation Complete (${bots.length} bots confirmed) ===`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
