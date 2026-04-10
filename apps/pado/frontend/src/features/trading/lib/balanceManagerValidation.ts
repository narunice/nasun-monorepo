/**
 * BalanceManager on-chain validation and recovery utilities
 */

import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG } from '../../../config/network';

/**
 * Validate that a BalanceManager object exists on-chain
 */
export async function validateBalanceManagerExists(id: string): Promise<boolean> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({ id });
    return obj.data !== null && obj.error === undefined;
  } catch {
    return false;
  }
}

/**
 * Find user's existing BalanceManager by querying BalanceManagerEvent.
 * BalanceManager is a shared object, so getOwnedObjects() won't work.
 * Instead, query creation events and verify ownership via getObject().
 */
export async function findUserBalanceManager(
  userAddress: string
): Promise<string | null> {
  try {
    const client = getSuiClient();
    const eventType = `${NETWORK_CONFIG.deepbookPackage}::balance_manager::BalanceManagerEvent`;

    // Query by sender, then filter for BalanceManagerEvent client-side.
    // Sender-scoped query ensures we find this user's events regardless of
    // how many total BalanceManagerEvents exist globally.
    const result = await client.queryEvents({
      query: { Sender: userAddress },
      limit: 50,
      order: 'descending',
    });

    for (const event of result.data) {
      if (event.type !== eventType) continue;
      const json = event.parsedJson as {
        balance_manager_id: string;
        owner: string;
      } | undefined;
      if (!json || json.owner !== userAddress) continue;

      // Verify object still exists on-chain
      const obj = await client.getObject({
        id: json.balance_manager_id,
        options: { showContent: true },
      });

      if (!obj.data || obj.error) continue;

      // Double-check owner field in object content
      const content = obj.data.content;
      if (content?.dataType === 'moveObject') {
        const fields = content.fields as Record<string, unknown>;
        if (fields.owner === userAddress) {
          return json.balance_manager_id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[findUserBalanceManager] Failed:', error);
    return null;
  }
}
