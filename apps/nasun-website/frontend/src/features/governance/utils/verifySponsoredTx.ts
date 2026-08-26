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
 * byte for byte, require the sender to still be the voter, and require the gas
 * to be charged to somebody other than the voter.
 *
 * That last check is not decoration. Constraining only the kind and the sender
 * leaves a second way through: return the correct vote, correctly addressed, but
 * set gasData.owner to the voter and gasData.budget high. The envelope then
 * quietly stops being sponsored -- the voter's own signature authorizes the gas,
 * the sponsor signature becomes irrelevant, the vote succeeds so nothing looks
 * wrong, and the voter pays for a transaction the UI promised was free. Budget,
 * price and payment stay unconstrained, which is safe once the payer is not the
 * user.
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

  // A missing owner is rejected too: an unsponsored envelope bills the sender.
  const gasOwner = parsed.gasData?.owner;
  if (!gasOwner || gasOwner === expectedSender) {
    throw new Error("Sponsor returned a transaction that charges gas to the voter. Vote aborted.");
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
