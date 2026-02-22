import { createHmac } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getWalletProofSecret } from '../utils/wallet-proof';
import { verifySignature } from '../utils/ethereum';
import { getCognitoIdentityId } from '../utils/cognito';
import { getAndDeleteNonce } from '../utils/dynamodb';
import { createOrUpdateMetaMaskProfile } from '../utils/userProfile';
import { maskSensitiveData } from '../utils/log-utils';

export async function handleVerify(
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
  const { walletAddress, signature } = body;

  if (!walletAddress || !signature) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'walletAddress and signature are required' }),
    };
  }

  // 1. DynamoDB에서 nonce 조회 및 즉시 삭제 (원자적 연산)
  // 이 방식으로 race condition을 방지합니다 - 동시 요청 시 하나만 nonce를 받을 수 있음
  const nonceData = await getAndDeleteNonce(walletAddress.toLowerCase());
  if (!nonceData) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce not found or expired (may have been used already)' }),
    };
  }

  const { nonce, expiresAt } = nonceData;

  // 2. Nonce 만료 확인 (이미 삭제됨, 만료만 체크)
  if (Date.now() / 1000 > expiresAt) {
    // 이미 삭제되었으므로 추가 삭제 불필요
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce expired' }),
    };
  }

  // 3. 서명 검증 (한국어/영어 모두 허용) - WalletConnectionBar 스타일과 통일
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

  // 한국어 메시지로 검증 시도
  let recoveredAddress: string;
  try {
    recoveredAddress = await verifySignature(messageKo, signature);
    if (recoveredAddress.toLowerCase() === walletAddress.toLowerCase()) {
      // 한국어 서명 검증 성공
    } else {
      // 영어 메시지로 재검증
      recoveredAddress = await verifySignature(messageEn, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Invalid signature' }),
        };
      }
    }
  } catch (error) {
    // 한국어 검증 실패 시 영어로 재시도
    try {
      recoveredAddress = await verifySignature(messageEn, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Invalid signature' }),
        };
      }
    } catch (retryError) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid signature' }),
      };
    }
  }

  // 4. Nonce는 이미 원자적으로 삭제됨 (getAndDeleteNonce에서 처리)

  // 5. Cognito Identity 발급
  const { identityId, token } = await getCognitoIdentityId(walletAddress);

  // 6. UserProfiles 테이블에 사용자 정보 저장
  try {
    await createOrUpdateMetaMaskProfile(identityId, walletAddress);
  } catch (error: any) {
    console.error('Failed to save user profile, but continuing:', maskSensitiveData({ message: error?.message }));
    // 프로필 저장 실패해도 인증은 성공으로 처리
  }

  // 7. Generate HMAC wallet proof token (for downstream register/withdraw Lambdas)
  const walletProofSecret = await getWalletProofSecret();
  const proofIssuedAt = new Date().toISOString();
  const walletProof = createHmac('sha256', walletProofSecret)
    .update(`${walletAddress.toLowerCase()}:${proofIssuedAt}`)
    .digest('hex');

  console.log(`Verification successful for wallet: ${walletAddress}, identityId: ${identityId}`);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ identityId, token, walletProof, proofIssuedAt }),
  };
}
