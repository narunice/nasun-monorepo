import { type SuiClient, type SuiObjectChange } from '@mysten/sui/client';
import { type Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const CLOCK_ID = '0x6';

export interface CreateMarketParams {
  label: string;
  question: string;
  description: string;
  category: string;
  resolutionSource: string;
  resolutionCriteria: string;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function buildCreateTx(packageId: string, cap: string, resolver: string, m: CreateMarketParams): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::create_market`,
    arguments: [
      tx.object(cap),
      tx.pure.string(m.question),
      tx.pure.string(m.description),
      tx.pure.string(m.category),
      tx.pure.string(m.resolutionSource),
      tx.pure.string(m.resolutionCriteria),
      tx.pure.u64(BigInt(m.closeTimeMs)),
      tx.pure.u64(BigInt(m.resolveDeadlineMs)),
      tx.pure.address(resolver),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Create one market, retrying without ever minting a second one.
 *
 * signAndExecuteTransaction can fail after the node accepted the transaction
 * (the response was lost: `fetch failed`, `socket hang up`, a proxy 5xx). A
 * fresh Transaction per attempt picks new gas, gets a new digest, and executes a
 * second create_market; `question` is onchain-immutable, so that duplicate is
 * permanent. So: build and sign once and resubmit the identical bytes. Sui
 * dedupes by digest, so a resubmit of an executed transaction returns its
 * original effects.
 *
 * Admission-time conflicts (stale gas version, locked object, equivocation)
 * prove the transaction did NOT execute, so those rebuild with fresh gas. Once a
 * response has been lost, though, a conflict is what SUCCESS looks like (the gas
 * coin was consumed by the attempt we never heard back from), so that case
 * throws instead of rebuilding.
 */
export async function createMarketOnChain(
  client: SuiClient, admin: Ed25519Keypair, packageId: string, cap: string,
  resolver: string, m: CreateMarketParams,
): Promise<string> {
  let lastErr: unknown;
  let signed: { bytes: Uint8Array; signature: string } | null = null;
  let mayHaveExecuted = false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (!signed) {
        const tx = buildCreateTx(packageId, cap, resolver, m);
        tx.setSender(admin.toSuiAddress());
        const bytes = await tx.build({ client });
        const { signature } = await admin.signTransaction(bytes);
        signed = { bytes, signature };
      }
      const r = await client.executeTransactionBlock({
        transactionBlock: signed.bytes, signature: signed.signature,
        options: { showEffects: true, showObjectChanges: true },
      });
      if (r.effects?.status?.status !== 'success') {
        throw new Error(`TX failed: ${r.effects?.status?.error ?? '?'}`);
      }
      await client.waitForTransaction({ digest: r.digest });
      const obj = r.objectChanges?.find(
        (c): c is Extract<SuiObjectChange, { type: 'created' }> =>
          c.type === 'created' && c.objectType.endsWith('::prediction_market::Market'),
      );
      if (!obj) throw new Error('Market not in objectChanges');
      return obj.objectId;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const conflict = /not available for consumption|current version|ObjectVersionUnavailable|already locked|reference is not available|EquivocationDetected/i.test(msg);
      // The SDK's http transport throws `Unexpected status code: 502`, which
      // contains no "HTTP", so match that shape as well.
      const lostResponse =
        /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|network|timeout/i.test(msg)
        || /(?:HTTP|status code:?)\s*(?:429|5\d\d)/i.test(msg);
      if (lostResponse) mayHaveExecuted = true;
      if (conflict && mayHaveExecuted) {
        throw new Error(
          `${m.label}: ambiguous outcome after a lost response (${msg}). ` +
          `The market may already exist -- check before re-running, then resume with --only.`,
        );
      }
      if (conflict) signed = null;
      if (!(conflict || lostResponse) || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}
