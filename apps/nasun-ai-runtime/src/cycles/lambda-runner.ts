/**
 * Generic single-step cycle runners (Model A "lambda" and Model B "record").
 *
 * Why these two siblings live together:
 *   They share the same shape (create on-chain request -> settle) and
 *   the same fatal-error contract: a `categorizeError` fatal flips the
 *   process-wide shutdown flag and the next scheduled cycle is skipped.
 *   The non-trader presets (research, content, analysis) all dispatch
 *   through one of these two.
 *
 * Model A (lambda):   Lambda runs the LLM and produces the settlement
 *                     digest. Agent only creates the request.
 * Model B (record):   Agent runs the LLM locally, then submits the
 *                     result + duration to Lambda for record-only
 *                     settlement. Fails LLM-first so a broken provider
 *                     does not orphan an on-chain request.
 *
 * Why we validate LLM output length before creating the on-chain
 * request in Model B (record):
 *   The on-chain request has a refund timeout — but a clearly bad LLM
 *   response (too short, or absurdly long) should never advance to
 *   settlement at all. Min length filters silent provider failures
 *   that return "" or a token-budget cutoff fragment.
 */

import type { SuiClient } from '@mysten/sui/client';

import { log } from '../logger.js';
import { requestShutdown } from '../lifecycle.js';
import type { Config } from '../config.js';
import { createRequest, sha256Hex, categorizeError } from '../nasun-ai-client.js';
import { executeRequest, recordRequest, type AERExtras } from '../executor-client.js';
import { callLLM } from '../llm-client.js';
import type { Preset } from '../presets/types.js';

export async function runSingleStepCycle(
  client: SuiClient,
  config: Config,
  preset: Preset
): Promise<void> {
  const steps = preset.generateSteps();
  const step = steps[0];

  if (config.mode === 'record') {
    await runRecordStep(client, config, step.prompt, step.category);
  } else {
    await runLambdaStep(client, config, step.prompt, step.category);
  }
}

export async function runLambdaStep(
  client: SuiClient,
  config: Config,
  prompt: string,
  category: string,
  extras?: AERExtras,
): Promise<{ success: boolean; result?: string }> {
  // Create on-chain request
  let requestId: number;
  try {
    const req = await createRequest(client, config.keypair, config, prompt, category);
    requestId = req.requestId;
    log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    log(`[error] Request creation failed: ${message}`);
    if (fatal) {
      log('[fatal] Fatal error. Stopping agent.');
      requestShutdown();
    }
    return { success: false };
  }

  // Call Lambda /execute
  const result = await executeRequest(
    config.lambdaUrl,
    config.apiKey,
    requestId,
    prompt,
    config.model,
    extras,
  );

  if (result.success) {
    log(`Lambda execution success. Digest: ${result.digest ?? 'n/a'}`);
    if (result.result) {
      const preview = result.result.length > 200
        ? result.result.slice(0, 200) + '...'
        : result.result;
      log(`Result preview: ${preview}`);
    }
  } else {
    log(`[error] Lambda execution failed: ${result.error}. Skipping to next cycle.`);
  }
  return { success: result.success, result: result.result };
}

export async function runRecordStep(
  client: SuiClient,
  config: Config,
  prompt: string,
  category: string,
): Promise<{ success: boolean; result?: string }> {
  // 1. Call own LLM first (fail-safe: no budget deduction if this fails)
  let llmResult;
  try {
    log(`Calling LLM: ${config.llmModel}`);
    llmResult = await callLLM(config.llmApiUrl, config.llmApiKey, config.llmModel, prompt);
    log(`LLM response: ${llmResult.content.length} chars, ${llmResult.totalTokens} tokens, ${llmResult.durationMs}ms`);
  } catch (err) {
    log(`[error] LLM call failed: ${err instanceof Error ? err.message : String(err)}. No funds deducted.`);
    return { success: false };
  }

  // 2. Validate result length before on-chain request (avoid orphaned requests)
  const MAX_RESULT_LENGTH = 10_000;
  const MIN_RESULT_LENGTH = 50;
  if (llmResult.content.length > MAX_RESULT_LENGTH) {
    log(`[warn] LLM response too long (${llmResult.content.length} chars). Truncating to ${MAX_RESULT_LENGTH}.`);
    llmResult.content = llmResult.content.slice(0, MAX_RESULT_LENGTH);
  }
  if (llmResult.content.length < MIN_RESULT_LENGTH) {
    log(`[error] LLM response too short (${llmResult.content.length} chars < ${MIN_RESULT_LENGTH}). Skipping.`);
    return { success: false };
  }

  // 3. Generate promptHash as hex string for Lambda verification
  const promptHashHex = sha256Hex(prompt);

  // 5. Create on-chain request (model = llmModel for accurate audit trail)
  let requestId: number;
  try {
    const req = await createRequest(client, config.keypair, config, prompt, category, config.llmModel);
    requestId = req.requestId;
    log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    log(`[error] Request creation failed: ${message}`);
    if (fatal) {
      log('[fatal] Fatal error. Stopping agent.');
      requestShutdown();
    }
    return { success: false };
  }

  // 6. Call Lambda /record for settlement
  const result = await recordRequest(
    config.lambdaUrl,
    config.apiKey,
    requestId,
    llmResult.content,
    promptHashHex,
    llmResult.durationMs,
  );

  if (result.success) {
    log(`Record settlement success. Digest: ${result.digest ?? 'n/a'}`);
    const preview = llmResult.content.length > 200
      ? llmResult.content.slice(0, 200) + '...'
      : llmResult.content;
    log(`Result preview: ${preview}`);
  } else {
    log(`[orphan] Record settlement failed for requestId=${requestId}: ${result.error}`);
    log(`[orphan] On-chain request will auto-refund after timeout.`);
  }
  return { success: result.success, result: llmResult.content };
}
