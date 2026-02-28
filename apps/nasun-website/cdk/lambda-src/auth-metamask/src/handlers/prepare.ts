import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { saveNonce } from '../utils/dynamodb';

/**
 * Prepare handler for 1-trip connectAndSign flow.
 * Generates a nonce + message WITHOUT requiring a wallet address upfront.
 * Stores nonce in DynamoDB with key "prepare:{nonce}" to avoid collision
 * with address-keyed entries from the existing challenge/verify flow.
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

  // Language detection (Accept-Language header)
  const acceptLanguage = event.headers['Accept-Language'] || event.headers['accept-language'] || '';
  const isKorean = acceptLanguage.toLowerCase().startsWith('ko');

  // Bilingual message (same format as challenge.ts)
  const message = isKorean
    ? `Nasun 지갑 인증

✅ 자금이 이체되지 않습니다
✅ 트랜잭션이 실행되지 않습니다
✅ 지갑 소유권만 확인합니다
✅ 서명 요청일 뿐입니다

Nonce: ${nonce}`
    : `Nasun Wallet Verification

✅ NO funds will be transferred
✅ NO transaction will be executed
✅ This only verifies wallet ownership
✅ This is a SIGNATURE request only

Nonce: ${nonce}`;

  // Store in DynamoDB with "prepare:" prefix key (5-minute TTL)
  // Store the original message so connect-verify uses the exact same text for ecrecover
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  await saveNonce(`prepare:${nonce}`, nonce, expiresAt, message);

  console.log('[prepare] Challenge prepared for 1-trip connectAndSign flow');

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ nonce, message }),
  };
}
