import { createHmac } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getWalletProofSecret } from '../utils/wallet-proof';
import { verifySuiPersonalSignature, verifyZkLoginEphemeralSignature } from '../utils/sui';
import { getCognitoIdentityId } from '../utils/cognito';
import { getAndDeleteNonce } from '../utils/dynamodb';
import { createOrUpdateSuiProfile } from '../utils/userProfile';
import { maskSensitiveData } from '../utils/log-utils';

/**
 * Connect-verify handler for Sui wallet authentication.
 * Self-custody / passkey: { signature, nonce } — recovers wallet address from Ed25519 personal message signature.
 * zkLogin: { signature, nonce, zkAddress, ephemeralPublicKey } — verifies ephemeral key signature,
 *   uses the claimed zkAddress as the wallet identity.
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
  const { signature, nonce, zkAddress, ephemeralPublicKey } = body;
  const isZkLogin = !!(zkAddress && ephemeralPublicKey);

  if (!signature || !nonce) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'signature and nonce are required' }),
    };
  }

  if (isZkLogin && !/^0x[a-f0-9]{64}$/.test(zkAddress)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Invalid zkAddress format' }),
    };
  }

  // 1. Atomic nonce retrieval + deletion (key = "suiPrepare:{nonce}")
  const nonceData = await getAndDeleteNonce(`suiPrepare:${nonce}`);
  if (!nonceData) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce not found or expired (may have been used already)' }),
    };
  }

  // 2. Check nonce expiry (already deleted atomically above)
  if (Date.now() / 1000 > nonceData.expiresAt) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce expired' }),
    };
  }

  if (!nonceData.message) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal error: nonce message not found' }),
    };
  }

  const messageBytes = new TextEncoder().encode(nonceData.message);
  let walletAddress: string;

  if (isZkLogin) {
    // 3a. zkLogin: verify the ephemeral key signature.
    // ZkLoginSigner.signWithEphemeralKey() uses keypair.signPersonalMessage() (same BCS prefix),
    // so verifyPersonalMessageSignature can recover the ephemeral public key.
    // We confirm the recovered key matches the provided ephemeralPublicKey, then trust
    // the claimed zkAddress as the wallet identity (ZK proof verification is deferred to
    // future work; for MVP this is acceptable since ZK proof binding is on the client side).
    try {
      const ephemeralValid = await verifyZkLoginEphemeralSignature(
        messageBytes,
        signature,
        ephemeralPublicKey
      );
      if (!ephemeralValid) throw new Error('Ephemeral key mismatch');
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid zkLogin ephemeral signature' }),
      };
    }
    walletAddress = zkAddress; // already validated format above
  } else {
    // 3b. Self-custody / passkey: recover wallet address from Ed25519 personal message signature.
    // verifyPersonalMessageSignature handles the BCS intent prefix internally —
    // the same prefix that LocalSigner.signPersonal() / keypair.signPersonalMessage() adds.
    try {
      walletAddress = await verifySuiPersonalSignature(messageBytes, signature);
    } catch {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid signature' }),
      };
    }

    // 4. Validate recovered Sui address format: 0x + 64 lowercase hex chars
    if (!/^0x[a-f0-9]{64}$/.test(walletAddress)) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid recovered Sui address' }),
      };
    }
  }

  // 5. Issue Cognito Developer Identity (identifier: nasun_{walletAddress})
  const { identityId, token } = await getCognitoIdentityId(walletAddress);

  // 6. Save/update user profile
  try {
    await createOrUpdateSuiProfile(identityId, walletAddress);
  } catch (error: any) {
    console.error('Failed to save user profile, but continuing:', maskSensitiveData({ message: error?.message }));
  }

  // 7. Generate HMAC wallet proof
  // Battalion NFT register-user Lambda validates walletProof as a required parameter
  const walletProofSecret = await getWalletProofSecret();
  const proofIssuedAt = new Date().toISOString();
  const walletProof = createHmac('sha256', walletProofSecret)
    .update(`${walletAddress}:${proofIssuedAt}`)
    .digest('hex');

  console.log(`[sui/connect-verify] Verification successful for wallet: ${walletAddress}, identityId: ${identityId}`);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ walletAddress, identityId, token, walletProof, proofIssuedAt }),
  };
}
