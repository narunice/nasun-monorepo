#!/usr/bin/env npx tsx
/**
 * Alliance NFT Bot Pattern Analysis
 *
 * Queries all AllianceMinted events from Nasun devnet and analyzes
 * "The Contractor" (image_index=2) minting spikes for bot patterns.
 *
 * Usage: npx tsx scripts/analyze-alliance-bots.ts
 */

const RPC_URL = "https://rpc.devnet.nasun.io";
const PACKAGE_ID =
  "0x2f2f9e1a1683462af44d3da1b5148f8671d446dbb913d5348efaf2f08819ba5b";
const EVENT_TYPE = `${PACKAGE_ID}::alliance_nft::AllianceMinted`;
const CHARACTER_NAMES = [
  "Taroka",
  "Princess Kaebo",
  "The Contractor",
  "Young Josen",
];
const SPIKE_THRESHOLD = 2.0; // multiplier over baseline to define spike
const MAX_PAGES = 500;

// ========== Types ==========

interface MintEvent {
  nftId: string;
  recipient: string;
  imageIndex: number;
  serialNumber: number;
  timestampMs: number;
  txDigest: string;
}

interface HourlyBucket {
  hour: string;
  counts: number[];
  events: MintEvent[];
}

// ========== RPC Helper ==========

let rpcReqId = 0;

async function rpcCall<T>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const id = ++rpcReqId;
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
  const json = (await res.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (json.error)
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

// ========== Phase 1: Collect Events ==========

async function collectAllEvents(): Promise<MintEvent[]> {
  const events: MintEvent[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await rpcCall<{
      data: Array<{
        id: { txDigest: string; eventSeq: string };
        timestampMs: string;
        parsedJson: {
          nft_id: string;
          recipient: string;
          image_index: string;
          serial_number: string;
        };
      }>;
      nextCursor: { txDigest: string; eventSeq: string } | null;
      hasNextPage: boolean;
    }>("suix_queryEvents", [
      { MoveEventType: EVENT_TYPE },
      cursor,
      50,
      false, // ascending
    ]);

    for (const ev of result.data) {
      events.push({
        nftId: ev.parsedJson.nft_id,
        recipient: ev.parsedJson.recipient,
        imageIndex: Number(ev.parsedJson.image_index),
        serialNumber: Number(ev.parsedJson.serial_number),
        timestampMs: Number(ev.timestampMs),
        txDigest: ev.id.txDigest,
      });
    }

    if (!result.hasNextPage) break;
    cursor = result.nextCursor;

    if ((page + 1) % 20 === 0) {
      process.stderr.write(`  ... fetched ${events.length} events (page ${page + 1})\n`);
    }
  }

  return events;
}

// ========== Phase 2: Spike Detection ==========

function toHourKey(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 13) + ":00Z";
}

function toMinuteKey(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 16) + "Z";
}

function detectRestoreBatches(events: MintEvent[]): Set<string> {
  // Restore batches: many events across all characters at the exact same timestampMs
  const byTimestamp = new Map<number, MintEvent[]>();
  for (const e of events) {
    const arr = byTimestamp.get(e.timestampMs) || [];
    arr.push(e);
    byTimestamp.set(e.timestampMs, arr);
  }

  const restoreHours = new Set<string>();
  for (const [ts, batch] of byTimestamp) {
    // If 10+ events share the exact same millisecond timestamp and span 3+ characters
    const chars = new Set(batch.map((e) => e.imageIndex));
    if (batch.length >= 10 && chars.size >= 3) {
      restoreHours.add(toHourKey(ts));
      console.log(
        `  [!] Detected restore batch at ${new Date(ts).toISOString()}: ${batch.length} events, ${chars.size} characters`,
      );
    }
  }
  return restoreHours;
}

function buildHourlyBuckets(
  events: MintEvent[],
  excludeHours: Set<string>,
): HourlyBucket[] {
  const map = new Map<string, HourlyBucket>();
  for (const e of events) {
    const hour = toHourKey(e.timestampMs);
    if (excludeHours.has(hour)) continue;
    if (!map.has(hour)) {
      map.set(hour, { hour, counts: [0, 0, 0, 0], events: [] });
    }
    const bucket = map.get(hour)!;
    if (e.imageIndex >= 0 && e.imageIndex <= 3) {
      bucket.counts[e.imageIndex]++;
    }
    bucket.events.push(e);
  }
  return [...map.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

function findSpikePeriods(
  buckets: HourlyBucket[],
  imageIndex: number,
  threshold: number,
): HourlyBucket[] {
  const counts = buckets.map((b) => b.counts[imageIndex]);
  const nonZero = counts.filter((c) => c > 0);
  if (nonZero.length === 0) return [];

  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const spikeThreshold = mean * threshold;

  console.log(
    `  Baseline: ${mean.toFixed(2)} mints/hour, spike threshold: ${spikeThreshold.toFixed(2)}`,
  );

  return buckets.filter((b) => b.counts[imageIndex] > spikeThreshold);
}

// ========== Phase 3: Bot Pattern Analysis ==========

function analyzeTimingPatterns(events: MintEvent[]): void {
  if (events.length < 2) {
    console.log("  Not enough events for timing analysis.");
    return;
  }

  const sorted = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    deltas.push((sorted[i].timestampMs - sorted[i - 1].timestampMs) / 1000);
  }

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  const p95 = deltas[Math.floor(deltas.length * 0.95)];
  const within10s = deltas.filter((d) => d <= 10).length;
  const within30s = deltas.filter((d) => d <= 30).length;
  const within60s = deltas.filter((d) => d <= 60).length;

  console.log(`  Total consecutive pairs: ${deltas.length}`);
  console.log(`  Median inter-mint interval: ${median.toFixed(1)}s`);
  console.log(`  P95 inter-mint interval: ${p95.toFixed(1)}s`);
  console.log(`  Fastest consecutive mint: ${deltas[0].toFixed(1)}s`);
  console.log(`  Pairs within 10s: ${within10s} (${((within10s / deltas.length) * 100).toFixed(1)}%)`);
  console.log(`  Pairs within 30s: ${within30s} (${((within30s / deltas.length) * 100).toFixed(1)}%)`);
  console.log(`  Pairs within 60s: ${within60s} (${((within60s / deltas.length) * 100).toFixed(1)}%)`);

  // Show rapid-fire clusters (mints within 10s of each other)
  if (within10s > 0) {
    console.log(`\n  Rapid-fire mints (<=10s gap):`);
    for (let i = 1; i < sorted.length; i++) {
      const delta = (sorted[i].timestampMs - sorted[i - 1].timestampMs) / 1000;
      if (delta <= 10) {
        console.log(
          `    ${new Date(sorted[i - 1].timestampMs).toISOString()} -> ${new Date(sorted[i].timestampMs).toISOString()} (${delta.toFixed(1)}s)`,
        );
        console.log(
          `      ${sorted[i - 1].recipient.slice(0, 20)}... -> ${sorted[i].recipient.slice(0, 20)}...`,
        );
      }
    }
  }
}

function analyzeAddressPatterns(events: MintEvent[]): void {
  const addresses = [...new Set(events.map((e) => e.recipient))].sort();

  console.log(`  Unique addresses: ${addresses.length}`);

  // Check duplicates
  const addrCounts = new Map<string, number>();
  for (const e of events) {
    addrCounts.set(e.recipient, (addrCounts.get(e.recipient) || 0) + 1);
  }
  const duplicates = [...addrCounts.entries()].filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    console.log(`  [!] Duplicate addresses found: ${duplicates.length}`);
    for (const [addr, count] of duplicates) {
      console.log(`    ${addr.slice(0, 20)}... minted ${count} times`);
    }
  } else {
    console.log(`  No duplicate addresses.`);
  }

  // Address prefix similarity
  if (addresses.length >= 2) {
    const prefixLengths: number[] = [];
    for (let i = 1; i < addresses.length; i++) {
      let common = 0;
      const a = addresses[i - 1];
      const b = addresses[i];
      // Skip "0x" prefix
      for (let j = 2; j < Math.min(a.length, b.length); j++) {
        if (a[j] === b[j]) common++;
        else break;
      }
      prefixLengths.push(common);
    }
    prefixLengths.sort((a, b) => a - b);
    const avgPrefix =
      prefixLengths.reduce((a, b) => a + b, 0) / prefixLengths.length;
    const maxPrefix = prefixLengths[prefixLengths.length - 1];
    const medianPrefix = prefixLengths[Math.floor(prefixLengths.length / 2)];

    console.log(
      `  Sorted address prefix similarity (hex chars after 0x):`,
    );
    console.log(`    Average: ${avgPrefix.toFixed(1)} chars`);
    console.log(`    Median: ${medianPrefix} chars`);
    console.log(`    Max: ${maxPrefix} chars`);

    // Show pairs with high prefix similarity (>= 4 chars)
    if (maxPrefix >= 4) {
      console.log(`\n  High-similarity address pairs (>= 4 common prefix chars):`);
      for (let i = 1; i < addresses.length; i++) {
        let common = 0;
        for (let j = 2; j < Math.min(addresses[i - 1].length, addresses[i].length); j++) {
          if (addresses[i - 1][j] === addresses[i][j]) common++;
          else break;
        }
        if (common >= 4) {
          console.log(
            `    ${addresses[i - 1].slice(0, 2 + common + 4)}... / ${addresses[i].slice(0, 2 + common + 4)}... (${common} chars)`,
          );
        }
      }
    }
  }
}

function analyzeCharacterRatio(
  spikeEvents: MintEvent[],
  allEvents: MintEvent[],
  spikeHourKeys: Set<string>,
): void {
  const spikeCounts = [0, 0, 0, 0];
  const nonSpikeCounts = [0, 0, 0, 0];

  for (const e of allEvents) {
    const hourKey = toHourKey(e.timestampMs);
    if (spikeHourKeys.has(hourKey)) {
      if (e.imageIndex >= 0 && e.imageIndex <= 3) spikeCounts[e.imageIndex]++;
    } else {
      if (e.imageIndex >= 0 && e.imageIndex <= 3)
        nonSpikeCounts[e.imageIndex]++;
    }
  }

  const spikeTotal = spikeCounts.reduce((a, b) => a + b, 0);
  const nonSpikeTotal = nonSpikeCounts.reduce((a, b) => a + b, 0);

  console.log(`  Character distribution comparison:`);
  console.log(
    `  ${"Character".padEnd(18)} | ${"Spike".padEnd(16)} | ${"Non-Spike".padEnd(16)}`,
  );
  console.log(`  ${"-".repeat(18)}-+-${"-".repeat(16)}-+-${"-".repeat(16)}`);
  for (let i = 0; i < 4; i++) {
    const spikePct =
      spikeTotal > 0 ? ((spikeCounts[i] / spikeTotal) * 100).toFixed(1) : "0.0";
    const nonSpikePct =
      nonSpikeTotal > 0
        ? ((nonSpikeCounts[i] / nonSpikeTotal) * 100).toFixed(1)
        : "0.0";
    console.log(
      `  ${CHARACTER_NAMES[i].padEnd(18)} | ${String(spikeCounts[i]).padEnd(5)} (${spikePct.padStart(5)}%) | ${String(nonSpikeCounts[i]).padEnd(5)} (${nonSpikePct.padStart(5)}%)`,
    );
  }
  console.log(
    `  ${"TOTAL".padEnd(18)} | ${String(spikeTotal).padEnd(5)}          | ${String(nonSpikeTotal).padEnd(5)}`,
  );
}

// ========== Phase 4: Report ==========

function printHourlyTable(buckets: HourlyBucket[]): void {
  console.log(
    `  ${"Hour (UTC)".padEnd(22)} | ${"Taroka".padEnd(7)} | ${"Kaebo".padEnd(7)} | ${"Contractor".padEnd(11)} | ${"Josen".padEnd(7)} | Total`,
  );
  console.log(
    `  ${"-".repeat(22)}-+-${"-".repeat(7)}-+-${"-".repeat(7)}-+-${"-".repeat(11)}-+-${"-".repeat(7)}-+------`,
  );
  for (const b of buckets) {
    const total = b.counts.reduce((a, c) => a + c, 0);
    const contractorMark = b.counts[2] > 0 ? " *" : "";
    console.log(
      `  ${b.hour.padEnd(22)} | ${String(b.counts[0]).padEnd(7)} | ${String(b.counts[1]).padEnd(7)} | ${String(b.counts[2]).padEnd(11)} | ${String(b.counts[3]).padEnd(7)} | ${total}${contractorMark}`,
    );
  }
}

function printSpikeWallets(spikeContractorEvents: MintEvent[]): void {
  const sorted = [...spikeContractorEvents].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  console.log(
    `  ${"#".padEnd(4)} | ${"Time (UTC)".padEnd(24)} | ${"Serial".padEnd(7)} | ${"Gap (s)".padEnd(8)} | Recipient`,
  );
  console.log(
    `  ${"-".repeat(4)}-+-${"-".repeat(24)}-+-${"-".repeat(7)}-+-${"-".repeat(8)}-+-${"-".repeat(44)}`,
  );

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const gap =
      i > 0
        ? ((e.timestampMs - sorted[i - 1].timestampMs) / 1000).toFixed(1)
        : "-";
    console.log(
      `  ${String(i + 1).padEnd(4)} | ${new Date(e.timestampMs).toISOString().padEnd(24)} | ${String(e.serialNumber).padEnd(7)} | ${String(gap).padEnd(8)} | ${e.recipient}`,
    );
  }
}

// ========== Main ==========

async function main() {
  console.log("=== Alliance NFT Bot Detection Report ===\n");

  // Phase 1
  console.log("[1] Collecting AllianceMinted events...");
  const events = await collectAllEvents();
  console.log(`  Total events: ${events.length}\n`);

  if (events.length === 0) {
    console.log("No events found. Exiting.");
    return;
  }

  // Summary
  const counts = [0, 0, 0, 0];
  for (const e of events) {
    if (e.imageIndex >= 0 && e.imageIndex <= 3) counts[e.imageIndex]++;
  }
  const timeRange = events.reduce(
    (acc, e) => ({
      min: Math.min(acc.min, e.timestampMs),
      max: Math.max(acc.max, e.timestampMs),
    }),
    { min: Infinity, max: -Infinity },
  );

  console.log("[2] Collection Summary");
  for (let i = 0; i < 4; i++) {
    console.log(`  ${CHARACTER_NAMES[i]}: ${counts[i]}`);
  }
  console.log(`  Time range: ${new Date(timeRange.min).toISOString()} to ${new Date(timeRange.max).toISOString()}\n`);

  // Detect restore batches
  console.log("[3] Detecting restore batches...");
  const restoreHours = detectRestoreBatches(events);
  if (restoreHours.size === 0) {
    console.log("  No restore batches detected.\n");
  } else {
    console.log(`  Excluding ${restoreHours.size} restore-batch hours from analysis.\n`);
  }

  // Phase 2
  console.log("[4] Hourly Distribution (excluding restore batches)");
  const buckets = buildHourlyBuckets(events, restoreHours);

  if (buckets.length === 0) {
    console.log("  No valid buckets after filtering. Exiting.");
    return;
  }

  printHourlyTable(buckets);
  console.log();

  // Spike detection
  console.log(`[5] Spike Detection (The Contractor, threshold: ${SPIKE_THRESHOLD}x baseline)`);
  const spikeBuckets = findSpikePeriods(buckets, 2, SPIKE_THRESHOLD);

  if (spikeBuckets.length === 0) {
    console.log("  No spike periods detected for The Contractor.\n");
    console.log("=== Analysis Complete ===");
    return;
  }

  const spikeHourKeys = new Set(spikeBuckets.map((b) => b.hour));
  const totalContractorInSpike = spikeBuckets.reduce(
    (a, b) => a + b.counts[2],
    0,
  );

  console.log(`  Spike hours: ${spikeBuckets.length}`);
  console.log(`  Spike period(s): ${spikeBuckets.map((b) => b.hour).join(", ")}`);
  console.log(`  Contractor mints in spike: ${totalContractorInSpike}\n`);

  // Collect spike-period Contractor events
  const spikeContractorEvents: MintEvent[] = [];
  for (const b of spikeBuckets) {
    for (const e of b.events) {
      if (e.imageIndex === 2) spikeContractorEvents.push(e);
    }
  }

  // Phase 3
  console.log("[6] Timing Pattern Analysis (spike-period Contractor mints)");
  analyzeTimingPatterns(spikeContractorEvents);
  console.log();

  console.log("[7] Address Pattern Analysis (spike-period Contractor mints)");
  analyzeAddressPatterns(spikeContractorEvents);
  console.log();

  console.log("[8] Character Selection Ratio (spike vs non-spike)");
  analyzeCharacterRatio(spikeContractorEvents, events, spikeHourKeys);
  console.log();

  // Phase 4: List all spike wallets
  console.log("[9] Spike-Period Contractor Wallets (chronological)");
  printSpikeWallets(spikeContractorEvents);
  console.log();

  // Also analyze ALL Contractor events timing for comparison
  const allContractorEvents = events.filter(
    (e) =>
      e.imageIndex === 2 &&
      !restoreHours.has(toHourKey(e.timestampMs)),
  );
  console.log("[10] Timing Pattern Analysis (ALL Contractor mints, for comparison)");
  analyzeTimingPatterns(allContractorEvents);
  console.log();

  console.log("=== Analysis Complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
