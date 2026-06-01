/**
 * Reports the browser's screen resolution to the backend once per session so
 * the impossible-resolution bot signal becomes wallet-attributable (Umami has
 * no wallet identifier). Fire-and-forget: never disrupts UX, never blocks
 * gameplay. See apps/gostop/backend POST /me/client-meta + migration 007.
 */

import { apiRequest } from './client';
import { getScreenString } from '../botSignal';

// Report at most once per wallet per page load.
const reported = new Set<string>();

export async function reportClientMeta(wallet: string): Promise<void> {
  if (reported.has(wallet)) return;
  reported.add(wallet);
  try {
    await apiRequest('/api/gostop/me/client-meta', {
      method: 'POST',
      authWallet: wallet,
      body: { screen: getScreenString() },
    });
  } catch {
    // Best-effort only. Allow a retry on the next session if this one failed.
    reported.delete(wallet);
  }
}
