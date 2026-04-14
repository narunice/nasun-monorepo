import { NETWORK_CONFIG } from '../../../config/network';
import { getChatService } from '../../../lib/chat-service';

export interface IdeaSubmitResult {
  ok: true;
  reportId: string;
  idempotent?: boolean;
}

export type IdeaSubmitError =
  | { kind: 'unauthorized' }
  | { kind: 'not_registered' }
  | { kind: 'validation'; message: string }
  | { kind: 'network' };

export interface IdeaSubmitInput {
  title: string;
  description: string;
}

export function generateReportId(): string {
  // crypto.randomUUID returns RFC-4122 v4 UUID in modern browsers.
  return `pado-${crypto.randomUUID()}`;
}

export async function submitIdea(
  input: IdeaSubmitInput,
): Promise<{ ok: true; result: IdeaSubmitResult } | { ok: false; error: IdeaSubmitError }> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  const sessionToken = getChatService().getSessionToken();

  if (!baseUrl) {
    return { ok: false, error: { kind: 'network' } };
  }
  if (!sessionToken) {
    return { ok: false, error: { kind: 'unauthorized' } };
  }

  const reportId = generateReportId();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/pado/idea-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        reportId,
        title: input.title,
        description: input.description,
      }),
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => ({} as { error?: string }));
    if (body.error === 'NASUN_NOT_REGISTERED') {
      return { ok: false, error: { kind: 'not_registered' } };
    }
    return { ok: false, error: { kind: 'unauthorized' } };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: string }));
    return {
      ok: false,
      error: { kind: 'validation', message: body.error || `HTTP ${res.status}` },
    };
  }

  const result = (await res.json()) as IdeaSubmitResult;
  return { ok: true, result };
}
