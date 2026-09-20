// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SuiTransactionBlockResponse } from '@mysten/sui/client';
import { assertVoteExecuted, readApiErrorMessage } from '../voteExecution';

function response(
  effects: SuiTransactionBlockResponse['effects'] | undefined
): SuiTransactionBlockResponse {
  return { digest: '0xdigest', effects } as SuiTransactionBlockResponse;
}

function failure(error: string): SuiTransactionBlockResponse {
  return response({ status: { status: 'failure', error } } as never);
}

/** The shape sui_executeTransactionBlock returns for a Move abort. */
function moveAbort(moduleName: string, code: number): string {
  return (
    `MoveAbort(MoveLocation { module: ModuleId { address: 0xabc, ` +
    `name: Identifier("${moduleName}") }, function: 5, instruction: 11, ` +
    `function_name: Some("vote_with_certificate") }, ${code}) in command 1`
  );
}

describe('assertVoteExecuted', () => {
  it('accepts a transaction whose effects report success', () => {
    expect(() =>
      assertVoteExecuted(response({ status: { status: 'success' } } as never))
    ).not.toThrow();
  });

  it('rejects a Move abort, which the execute RPC itself resolves for', () => {
    // The RPC does not reject when a transaction aborts during execution: the
    // transaction ran, effects say failure, and on the direct-vote path gas was
    // already spent. Reporting that as a successful vote is the defect.
    expect(() => assertVoteExecuted(failure(moveAbort('proposal', 0)))).toThrow(
      'You have already voted on this proposal'
    );
  });

  it('names the three shared abort codes in both proposal modules', () => {
    const cases: [string, number, string][] = [
      ['proposal', 0, 'already voted'],
      ['proposal', 1, 'delisted'],
      ['proposal', 2, 'expired'],
      ['multi_choice_proposal', 0, 'already voted'],
      ['multi_choice_proposal', 1, 'delisted'],
      ['multi_choice_proposal', 2, 'expired'],
    ];

    for (const [moduleName, code, expected] of cases) {
      expect(() =>
        assertVoteExecuted(failure(moveAbort(moduleName, code)))
      ).toThrow(new RegExp(expected, 'i'));
    }
  });

  it('separates the codes that diverge between the two modules', () => {
    expect(() =>
      assertVoteExecuted(failure(moveAbort('proposal', 3)))
    ).toThrow(/no longer supported/i);
    expect(() =>
      assertVoteExecuted(failure(moveAbort('multi_choice_proposal', 3)))
    ).toThrow(/choice is not valid/i);
  });

  it('explains certificate failures raised by the voting_power module', () => {
    expect(() =>
      assertVoteExecuted(failure(moveAbort('voting_power', 1)))
    ).toThrow(/certificate expired/i);
    expect(() =>
      assertVoteExecuted(failure(moveAbort('voting_power', 4)))
    ).toThrow(/temporarily paused/i);
  });

  it('surfaces an unmapped failure verbatim rather than swallowing it', () => {
    expect(() => assertVoteExecuted(failure('InsufficientGas'))).toThrow(
      /InsufficientGas/
    );
  });

  it('refuses to confirm when effects are missing entirely', () => {
    expect(() => assertVoteExecuted(response(undefined))).toThrow(
      /could not be confirmed/i
    );
  });
});

describe('readApiErrorMessage', () => {
  it('reports a duplicate vote from the status code alone', async () => {
    // The body used to be parsed before the status was checked, so an empty or
    // HTML 409 replaced this message with a SyntaxError.
    const empty = new Response('', { status: 409 });
    await expect(readApiErrorMessage(empty, 'fallback')).resolves.toBe(
      'You have already voted on this proposal'
    );
  });

  it('still reports a duplicate vote when the 409 body is HTML', async () => {
    const html = new Response('<html>502 Bad Gateway</html>', { status: 409 });
    await expect(readApiErrorMessage(html, 'fallback')).resolves.toBe(
      'You have already voted on this proposal'
    );
  });

  it('prefers a JSON error field when the body has one', async () => {
    const json = new Response(JSON.stringify({ error: 'Oracle is paused' }), {
      status: 503,
    });
    await expect(readApiErrorMessage(json, 'fallback')).resolves.toBe(
      'Oracle is paused'
    );
  });

  it('falls back with the status code when the body is not JSON', async () => {
    const html = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    await expect(
      readApiErrorMessage(html, 'Failed to get certificate')
    ).resolves.toBe('Failed to get certificate (HTTP 502)');
  });

  it('falls back when the JSON body carries no error field', async () => {
    const json = new Response(JSON.stringify({ detail: 'nope' }), {
      status: 500,
    });
    await expect(readApiErrorMessage(json, 'Failed to sponsor')).resolves.toBe(
      'Failed to sponsor (HTTP 500)'
    );
  });
});
