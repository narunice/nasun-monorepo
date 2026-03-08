import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { saveNonce } from '../utils/dynamodb';

/**
 * Prepare handler for Sui wallet connect-and-sign flow.
 * Generates a nonce + message WITHOUT requiring a wallet address upfront.
 * Stores nonce in DynamoDB with key "suiPrepare:{nonce}" to namespace it
 * away from any other nonce entries.
 *
 * Chain context "(Sui)" is included in the message to prevent cross-chain
 * replay attacks (e.g., an EVM signature cannot be submitted here).
 */
export async function handlePrepare(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  // Generate random nonce (32 bytes hex)
  const nonce = randomBytes(32).toString('hex');

  // Fixed English message with Sui chain context
  const message = `Nasun Wallet Verification (Sui)

\u2705 NO funds will be transferred
\u2705 NO transaction will be executed
\u2705 This only verifies wallet ownership
\u2705 This is a SIGNATURE request only

Nonce: ${nonce}`;

  // Store in DynamoDB with "suiPrepare:" prefix key (5-minute TTL)
  // Store the exact message so connect-verify uses the same bytes for signature verification
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  await saveNonce(`suiPrepare:${nonce}`, nonce, expiresAt, message);

  console.log('[sui/prepare] Challenge prepared for Sui wallet connect-and-sign flow');

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ nonce, message }),
  };
}
