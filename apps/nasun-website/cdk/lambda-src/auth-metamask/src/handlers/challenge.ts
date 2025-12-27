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

  // 언어 감지 (Accept-Language 헤더 확인)
  const acceptLanguage = event.headers['Accept-Language'] || event.headers['accept-language'] || '';
  const isKorean = acceptLanguage.toLowerCase().startsWith('ko');

  // 다국어 메시지 생성
  const message = isKorean
    ? `NASUN 로그인

⚠️ 중요 안내:
• 이 서명으로 돈이 빠져나가지 않습니다
• 지갑 소유자 본인임을 확인하기 위한 것입니다
• NASUN 공식 사이트에서만 서명하세요

Nonce: ${nonce}`
    : `Login to NASUN

⚠️ Important Notice:
• This signature does NOT transfer any funds
• This is only to verify you own this wallet
• Only sign on the official NASUN website

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
