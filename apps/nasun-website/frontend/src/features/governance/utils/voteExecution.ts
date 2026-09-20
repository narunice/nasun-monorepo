/**
 * Shared post-execution and error-reporting helpers for the four vote hooks.
 *
 * Both live on the same fault line: the vote path used to report success (or a
 * useful error) based on something other than what actually happened.
 */

import { SuiTransactionBlockResponse } from "@mysten/sui/client";

/**
 * Move abort codes, keyed by the module that raises them. Codes 0-2 mean the
 * same thing in both proposal modules; everything past that diverges.
 */
const ABORT_MESSAGES: Record<string, Record<number, string>> = {
  proposal: {
    0: "You have already voted on this proposal",
    1: "This proposal has been delisted and no longer accepts votes",
    2: "This proposal has expired and no longer accepts votes",
    3: "This voting method is no longer supported. Reload the page and try again",
  },
  multi_choice_proposal: {
    0: "You have already voted on this proposal",
    1: "This proposal has been delisted and no longer accepts votes",
    2: "This proposal has expired and no longer accepts votes",
    3: "That choice is not valid for this proposal",
  },
  voting_power: {
    0: "Your voting power certificate was rejected. Reload the page and try again",
    1: "Your voting power certificate expired before the vote was submitted. Try again",
    2: "Your voting power certificate was issued for a different proposal",
    3: "Your voting power certificate was issued for a different wallet",
    4: "Voting is temporarily paused. Try again later",
    6: "A voting power certificate has already been issued for this proposal",
  },
};

/**
 * Turn a Move abort inside transaction effects into something a voter can act
 * on. Falls back to the raw status text when the shape is unfamiliar, which is
 * still far better than reporting the vote as successful.
 */
function describeExecutionFailure(statusError: string | undefined): string {
  if (!statusError) return "The vote transaction failed on chain";

  const abortCode = statusError.match(/MoveAbort\(.*?,\s*(\d+)\)/)?.[1];
  const moduleName = statusError.match(/Identifier\("(\w+)"\)/)?.[1];

  if (abortCode !== undefined && moduleName) {
    const message = ABORT_MESSAGES[moduleName]?.[Number(abortCode)];
    if (message) return message;
  }

  return `The vote transaction failed on chain: ${statusError}`;
}

/**
 * A Move abort does not reject the execute RPC. The transaction is executed,
 * effects come back with status "failure", and on the direct-vote path the
 * voter is still charged gas. Read the status before telling anyone their vote
 * counted.
 */
export function assertVoteExecuted(result: SuiTransactionBlockResponse): void {
  const status = result.effects?.status;

  if (!status) {
    throw new Error(
      "The vote could not be confirmed on chain. Check your vote history before voting again"
    );
  }

  if (status.status !== "success") {
    throw new Error(describeExecutionFailure(status.error));
  }
}

/**
 * Read an error body without letting a non-JSON response (an edge 502, an empty
 * 409) replace the real reason with a SyntaxError. The status code is the
 * reliable signal; the body is only ever a refinement of it.
 */
export async function readApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  if (response.status === 409) {
    return "You have already voted on this proposal";
  }

  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Body was not JSON. The status code below is what matters.
  }

  return `${fallback} (HTTP ${response.status})`;
}
