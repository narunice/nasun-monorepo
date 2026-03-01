import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { saveNonce } from '../utils/dynamodb';

export async function handleChallenge(
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
  const { walletAddress } = body;

  if (!walletAddress) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'walletAddress is required' }),
    };
  }

  // 지갑 주소 형식 검증
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Invalid Ethereum address format' }),
    };
  }

  // 무작위 nonce 생성 (32바이트 hex)
  const nonce = randomBytes(32).toString('hex');

  // Language detection: prefer explicit lang from request body, fallback to Accept-Language
  const lang = body.lang;
  const acceptLanguage = event.headers['Accept-Language'] || event.headers['accept-language'] || '';
  const isKorean = lang
    ? lang.toLowerCase().startsWith('ko')
    : acceptLanguage.toLowerCase().startsWith('ko');

  // 다국어 메시지 생성 (WalletConnectionBar 스타일과 통일)
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

  // DynamoDB에 nonce 저장 (TTL 5분)
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5분 후
  await saveNonce(walletAddress.toLowerCase(), nonce, expiresAt);

  console.log(`Challenge created for wallet: ${walletAddress}`);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ nonce, message }),
  };
}
