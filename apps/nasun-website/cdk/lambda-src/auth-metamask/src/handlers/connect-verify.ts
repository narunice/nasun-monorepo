import { createHmac } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getWalletProofSecret } from '../utils/wallet-proof';
import { verifySignature } from '../utils/ethereum';
import { getCognitoIdentityId } from '../utils/cognito';
import { getAndDeleteNonce } from '../utils/dynamodb';
import { createOrUpdateMetaMaskProfile } from '../utils/userProfile';
import { maskSensitiveData } from '../utils/log-utils';

/**
 * Connect-verify handler for 1-trip connectAndSign flow.
 * Accepts { signature, nonce } — recovers wallet address from the signature.
 * No walletAddress parameter needed (avoids iOS eth_accounts race condition).
 */
export async function handleConnectVerify(
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

  const body = JSON.parse(event.body || '{}');
  const { signature, nonce } = body;

  if (!signature || !nonce) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'signature and nonce are required' }),
    };
  }

  // 1. Atomic nonce retrieval + deletion (key = "prepare:{nonce}")
  const nonceData = await getAndDeleteNonce(`prepare:${nonce}`);
  if (!nonceData) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce not found or expired (may have been used already)' }),
    };
  }

  const { expiresAt } = nonceData;

  // 2. Check nonce expiry (already deleted atomically)
  if (Date.now() / 1000 > expiresAt) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce expired' }),
    };
  }

  // 3. Verify signature — try Korean message first, then English (same as verify.ts)
  const messageKo = `Nasun 지갑 인증

✅ 자금이 이체되지 않습니다
✅ 트랜잭션이 실행되지 않습니다
✅ 지갑 소유권만 확인합니다
✅ 서명 요청일 뿐입니다

Nonce: ${nonce}`;

  const messageEn = `Nasun Wallet Verification

✅ NO funds will be transferred
✅ NO transaction will be executed
✅ This only verifies wallet ownership
✅ This is a SIGNATURE request only

Nonce: ${nonce}`;

  // Recover wallet address from signature (no client-provided address needed)
  let walletAddress: string;
  try {
    walletAddress = await verifySignature(messageKo, signature);
  } catch {
    try {
      walletAddress = await verifySignature(messageEn, signature);
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid signature' }),
      };
    }
  }

  // Normalize to lowercase
  walletAddress = walletAddress.toLowerCase();

  // Validate recovered address format
  if (!/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Invalid recovered address' }),
    };
  }

  // 4. Issue Cognito Identity
  const { identityId, token } = await getCognitoIdentityId(walletAddress);

  // 5. Save/update user profile
  try {
    await createOrUpdateMetaMaskProfile(identityId, walletAddress);
  } catch (error: any) {
    console.error('Failed to save user profile, but continuing:', maskSensitiveData({ message: error?.message }));
  }

  // 6. Generate HMAC wallet proof
  const walletProofSecret = await getWalletProofSecret();
  const proofIssuedAt = new Date().toISOString();
  const walletProof = createHmac('sha256', walletProofSecret)
    .update(`${walletAddress}:${proofIssuedAt}`)
    .digest('hex');

  console.log(`[connect-verify] Verification successful for wallet: ${walletAddress}, identityId: ${identityId}`);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ walletAddress, identityId, token, walletProof, proofIssuedAt }),
  };
}
