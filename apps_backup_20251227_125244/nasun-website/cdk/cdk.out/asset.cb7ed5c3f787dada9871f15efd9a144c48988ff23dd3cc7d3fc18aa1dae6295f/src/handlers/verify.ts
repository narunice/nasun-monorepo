import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifySignature } from '../utils/ethereum';
import { getCognitoIdentityId } from '../utils/cognito';
import { getNonce, deleteNonce } from '../utils/dynamodb';
import { createOrUpdateMetaMaskProfile } from '../utils/userProfile';

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

  // 1. DynamoDB에서 nonce 조회
  const nonceData = await getNonce(walletAddress.toLowerCase());
  if (!nonceData) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce not found or expired' }),
    };
  }

  const { nonce, expiresAt } = nonceData;

  // 2. Nonce 만료 확인
  if (Date.now() / 1000 > expiresAt) {
    await deleteNonce(walletAddress.toLowerCase());
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Nonce expired' }),
    };
  }

  // 3. 서명 검증 (한국어/영어 모두 허용)
  const messageKo = `NASUN 로그인

⚠️ 중요 안내:
• 이 서명으로 돈이 빠져나가지 않습니다
• 지갑 소유자 본인임을 확인하기 위한 것입니다
• NASUN 공식 사이트에서만 서명하세요

Nonce: ${nonce}`;

  const messageEn = `Login to NASUN

⚠️ Important Notice:
• This signature does NOT transfer any funds
• This is only to verify you own this wallet
• Only sign on the official NASUN website

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

  // 4. Nonce 삭제 (재사용 방지)
  await deleteNonce(walletAddress.toLowerCase());

  // 5. Cognito Identity 발급
  const { identityId, token } = await getCognitoIdentityId(walletAddress);

  // 6. UserProfiles 테이블에 사용자 정보 저장
  try {
    await createOrUpdateMetaMaskProfile(identityId, walletAddress);
  } catch (error) {
    console.error('Failed to save user profile, but continuing:', error);
    // 프로필 저장 실패해도 인증은 성공으로 처리
  }

  console.log(`Verification successful for wallet: ${walletAddress}, identityId: ${identityId}`);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ identityId, token }),
  };
}
