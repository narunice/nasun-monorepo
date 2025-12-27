// OAuth 2.0 Authorization Code with PKCE 헬퍼 함수들

import * as crypto from 'crypto';
import { EnvConfig } from './env';

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface OAuth2AuthorizationRequest {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

// PKCE Code Verifier 생성 (43-128 characters, URL-safe)
export function generateCodeVerifier(): string {
  return crypto
    .randomBytes(32)
    .toString('base64url'); // Node.js 14.18.0+ 지원
}

// PKCE Code Challenge 생성 (SHA256 해시)
export function generateCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

// PKCE Challenge 객체 생성
export function generatePKCEChallenge(): PKCEChallenge {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

// 랜덤 State 생성 (CSRF 보호)
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

// OAuth 2.0 Authorization URL 생성
export function buildAuthorizationUrl(config: EnvConfig, challenge: PKCEChallenge, state: string): string {
  const baseUrl = 'https://x.com/i/oauth2/authorize';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.oauth2ClientId,
    redirect_uri: config.oauth2RedirectUri,
    scope: 'tweet.read users.read follows.read offline.access like.read list.read', // 최대 READ 권한 (WRITE 제외)
    state: state,
    code_challenge: challenge.codeChallenge,
    code_challenge_method: challenge.codeChallengeMethod
  });
  
  return `${baseUrl}?${params.toString()}`;
}

// OAuth 2.0 Authorization 요청 생성
export function createAuthorizationRequest(config: EnvConfig): OAuth2AuthorizationRequest {
  const challenge = generatePKCEChallenge();
  const state = generateState();
  const authorizationUrl = buildAuthorizationUrl(config, challenge, state);
  
  return {
    authorizationUrl,
    state,
    codeVerifier: challenge.codeVerifier
  };
}

// Authorization Code를 Access Token으로 교환
export async function exchangeCodeForToken(
  config: EnvConfig,
  authorizationCode: string,
  codeVerifier: string
): Promise<OAuth2TokenResponse> {
  const tokenUrl = 'https://api.x.com/2/oauth2/token';
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.oauth2ClientId,
    code: authorizationCode,
    redirect_uri: config.oauth2RedirectUri,
    code_verifier: codeVerifier
  });
  
  // Client Secret이 있는 경우 Basic Auth 사용
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  if (config.oauth2ClientSecret) {
    const credentials = Buffer.from(`${config.oauth2ClientId}:${config.oauth2ClientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }
  
  const tokenData = await response.json() as OAuth2TokenResponse;
  return tokenData;
}

// Refresh Token으로 새 Access Token 발급
export async function refreshAccessToken(
  config: EnvConfig,
  refreshToken: string
): Promise<OAuth2TokenResponse> {
  const tokenUrl = 'https://api.x.com/2/oauth2/token';
  
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.oauth2ClientId
  });
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  if (config.oauth2ClientSecret) {
    const credentials = Buffer.from(`${config.oauth2ClientId}:${config.oauth2ClientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }
  
  const tokenData = await response.json() as OAuth2TokenResponse;
  return tokenData;
}

// Access Token 만료 시간 계산
export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + (expiresIn * 1000));
}

// Token이 만료되었는지 확인 (60분 여유분 적용)
// 하이브리드 전략: 90분 주기 EventBridge + 60분 전 갱신 = 수학적 안전망
// 토큰 유효 시간: 120분, EventBridge 주기: 90분, 갱신 임계값: 60분 전
// 결과: 90분 후 실행 시 항상 30분 이하 남음 → 항상 갱신 트리거 (Boundary Condition Bug 수정)
export function isTokenExpired(expiryDate: Date): boolean {
  const sixtyMinutesFromNow = new Date(Date.now() + (60 * 60 * 1000));
  return expiryDate <= sixtyMinutesFromNow;
}

// OAuth 2.0 스코프 검증
export function validateScopes(receivedScopes: string, requiredScopes: string[]): boolean {
  const received = receivedScopes.split(' ');
  return requiredScopes.every(scope => received.includes(scope));
}