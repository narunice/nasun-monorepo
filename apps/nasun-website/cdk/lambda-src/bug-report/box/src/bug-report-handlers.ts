// User-facing bug-report handlers (box port of the bug-report lambda index.ts).
//  POST /bug-report             submit (validate -> cooldown -> insert -> Telegram notify)
//  GET  /bug-report/my-reports  own reports (identityId index, newest 50)
//  GET  /bug-report/upload-url  signed screenshot upload (box FS presigned-POST replacement)
//  POST /bug-report/{id}/reply  reopen a closed ticket (conditional, owner-only)

import { randomUUID } from 'node:crypto';
import type { Result } from './result';
import { hasRecentReport, getReport, listReportsByIdentity } from './db';
import { insertReport, reopenReport } from './write-db';
import { buildUpload, ALLOWED_UPLOAD_CONTENT_TYPES, isValidKey } from './screenshots';
import { sendTelegram } from './clients';

const ALLOWED_CATEGORIES = ['UI Bug', 'Wallet Issue', 'Performance', 'Security', 'Feature Request', 'Feedback', 'Other'];
const ALLOWED_APPS = ['nasun', 'pado', 'gostop', 'network-explorer', 'general'];
const MAX_SCREENSHOTS = 3;
const COOLDOWN_MINUTES = 5;
const REPLY_MAX_LENGTH = 1000;

interface SubmitBody {
  title?: string;
  app?: string;
  category?: string;
  description?: string;
  reproSteps?: string;
  displayName?: string;
  screenshotKeys?: string[];
  pageUrl?: string;
  walletAddress?: string;
}

export async function handleSubmit(identityId: string, raw: string): Promise<Result> {
  let body: SubmitBody;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }

  const { title, app, category, description, reproSteps, displayName, screenshotKeys, pageUrl, walletAddress } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { status: 400, body: { error: 'Title is required' } };
  }
  if (title.length > 100) {
    return { status: 400, body: { error: 'Title too long (max 100 characters)' } };
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return { status: 400, body: { error: 'Description is required' } };
  }
  if (description.length > 2000) {
    return { status: 400, body: { error: 'Description too long (max 2000 characters)' } };
  }
  if (category && (typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category))) {
    return { status: 400, body: { error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}` } };
  }
  if (app && (typeof app !== 'string' || !ALLOWED_APPS.includes(app))) {
    return { status: 400, body: { error: `Invalid app. Allowed: ${ALLOWED_APPS.join(', ')}` } };
  }
  if (reproSteps && (typeof reproSteps !== 'string' || reproSteps.length > 2000)) {
    return { status: 400, body: { error: 'Repro steps too long (max 2000 characters)' } };
  }
  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim().length === 0) {
    return { status: 400, body: { error: 'Wallet address is required' } };
  }
  if (screenshotKeys) {
    if (!Array.isArray(screenshotKeys) || screenshotKeys.length > MAX_SCREENSHOTS) {
      return { status: 400, body: { error: `Maximum ${MAX_SCREENSHOTS} screenshots allowed` } };
    }
    // Use the SAME key predicate the serve path enforces (isValidKey), so a stored key always renders for the
    // admin -- avoids the write-loose / read-strict asymmetry that would silently drop a screenshot. Stricter
    // than the lambda's prefix-only check, but every legitimate key (minted by buildUpload) satisfies it.
    if (screenshotKeys.some((k) => !isValidKey(k))) {
      return { status: 400, body: { error: 'Invalid screenshot key format' } };
    }
  }

  // Per-user cooldown (parity with the lambda identityId-index Query, last 5 min).
  const sinceIso = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
  if (await hasRecentReport(identityId, sinceIso)) {
    return { status: 429, body: { error: `Please wait ${COOLDOWN_MINUTES} minutes between submissions` } };
  }

  const reportId = randomUUID();
  const timestamp = new Date().toISOString();

  await insertReport(reportId, timestamp, identityId, 'new', {
    title: title.trim(),
    app: app || 'general',
    category: category || 'Other',
    description: description.trim(),
    reproSteps: reproSteps?.trim() || null,
    screenshotKeys: screenshotKeys || [],
    walletAddress: walletAddress.trim(),
    pageUrl: pageUrl && typeof pageUrl === 'string' ? pageUrl.trim().slice(0, 500) : null,
  });

  // Telegram notification (best-effort). Byte-parity with the lambda sendTelegramNotification.
  const text = [
    `[Bug Report] #${reportId.slice(0, 8)}`,
    `App: ${app || 'general'}`,
    `Category: ${category || 'Other'}`,
    `From: ${typeof displayName === 'string' ? displayName : 'Unknown'}`,
    '---',
    `Title: ${title.trim()}`,
    `Description: ${description.trim().slice(0, 500)}`,
    (screenshotKeys?.length || 0) > 0 ? `Screenshots: ${screenshotKeys?.length}` : '',
  ].filter(Boolean).join('\n');
  await sendTelegram(text);

  return { status: 200, body: { reportId, message: 'Bug report submitted successfully' } };
}

export async function handleMyReports(identityId: string): Promise<Result> {
  const reports = await listReportsByIdentity(identityId, 50);
  return { status: 200, body: { reports } };
}

export function handleUploadUrl(identityId: string, contentType: string | undefined): Result {
  if (!contentType || !ALLOWED_UPLOAD_CONTENT_TYPES.includes(contentType)) {
    return { status: 400, body: { error: 'contentType must be image/png, image/jpeg, or image/webp' } };
  }
  const presigned = buildUpload(identityId, contentType);
  if (!presigned) {
    return { status: 500, body: { error: 'Screenshot upload not configured' } };
  }
  return { status: 200, body: presigned };
}

export async function handleReply(identityId: string, reportId: string, raw: string): Promise<Result> {
  if (!reportId || typeof reportId !== 'string') {
    return { status: 400, body: { error: 'reportId is required' } };
  }
  let body: { timestamp?: string; text?: string };
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }
  const { timestamp, text } = body;
  // timestamp is required for API contract parity (the frontend sends it); the box keys on report_id (unique).
  if (!timestamp || typeof timestamp !== 'string') {
    return { status: 400, body: { error: 'timestamp is required' } };
  }
  if (!text || typeof text !== 'string') {
    return { status: 400, body: { error: 'text is required' } };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > REPLY_MAX_LENGTH) {
    return { status: 400, body: { error: `text must be 1-${REPLY_MAX_LENGTH} characters` } };
  }

  const now = new Date().toISOString();
  const reopened = await reopenReport(reportId, identityId, trimmed, now);

  if (!reopened) {
    // Conditional failed -> distinguish 404 / 403 (forgery) / 409 (not open). Parity with the lambda.
    const existing = await getReport(reportId);
    if (!existing) return { status: 404, body: { error: 'Report not found' } };
    if (existing.identityId !== identityId) {
      console.warn(`Reply forgery attempt: identity=${identityId} tried to reply on report owned by=${existing.identityId} reportId=${reportId}`);
      return { status: 403, body: { error: 'Forbidden' } };
    }
    return { status: 409, body: { error: 'This ticket is not open for reply' } };
  }

  // Telegram reopen notification (best-effort).
  const preview = trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
  await sendTelegram([
    `[Bug Report Reopened] #${reportId.slice(0, 8)}`,
    `From: identity=${identityId.slice(0, 16)}...`,
    '---',
    `Reply: ${preview}`,
  ].join('\n').slice(0, 4096));

  return { status: 200, body: { ok: true, updatedAt: now } };
}
