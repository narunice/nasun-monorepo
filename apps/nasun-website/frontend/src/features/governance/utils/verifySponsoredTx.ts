import { TransactionDataBuilder } from "@mysten/sui/transactions";

/**
 * Check that a sponsor returned the transaction we actually asked it to sponsor.
 *
 * The sponsored-vote flow sends only the transaction *kind* to the governance
 * API and gets back complete TransactionData, which the wallet then signs. With
 * nothing verified in between, whatever bytes that endpoint returns are what the
 * user signs -- a compromised or spoofed sponsor could swap in an unrelated PTB
 * (a coin transfer, say) and the wallet would sign it silently, because the only
 * thing the user ever saw was a "Confirm Vote" dialog.
 *
 * So re-derive the kind from the returned bytes and require it to match ours
 * byte for byte, and require the sender to still be the voter. The gas object
 * and budget are the sponsor's to choose and are deliberately not constrained.
 *
 * This is the client's own check. It does not depend on trusting the API,
 * which is the point.
 */
export function assertSponsoredTxMatches(
  txBytes: Uint8Array,
  expectedKindBytes: Uint8Array,
  expectedSender: string,
): void {
  let parsed: ReturnType<typeof TransactionDataBuilder.fromBytes>;
  try {
    parsed = TransactionDataBuilder.fromBytes(txBytes);
  } catch {
    throw new Error("Sponsor returned a transaction that could not be parsed. Vote aborted.");
  }

  if (parsed.sender !== expectedSender) {
    throw new Error("Sponsor returned a transaction for a different sender. Vote aborted.");
  }

  let reDerivedKind: Uint8Array;
  try {
    reDerivedKind = TransactionDataBuilder.restore({ ...parsed.snapshot() }).build({
      onlyTransactionKind: true,
    });
  } catch {
    throw new Error("Sponsor returned a transaction whose contents could not be read. Vote aborted.");
  }

  if (reDerivedKind.length !== expectedKindBytes.length) {
    throw new Error("Sponsor returned a different transaction than the one requested. Vote aborted.");
  }
  for (let i = 0; i < reDerivedKind.length; i++) {
    if (reDerivedKind[i] !== expectedKindBytes[i]) {
      throw new Error("Sponsor returned a different transaction than the one requested. Vote aborted.");
    }
  }
}
