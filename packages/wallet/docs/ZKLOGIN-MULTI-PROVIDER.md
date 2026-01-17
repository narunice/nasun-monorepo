# zkLogin Multi-Provider Implementation Plan

> Created: 2026-01-16
> Status: PLANNED
> Target: Apple, Twitch, Facebook, Kakao

---

## 1. Overview

Add 4 additional OAuth providers to zkLogin authentication system.

### Current State

| Provider | OAuth URL Builder | detectProvider | Salt API | UI Button | Status |
|----------|-------------------|----------------|----------|-----------|--------|
| Google | O | O | O | O | **Production** |
| Apple | O | O | X | O | URL builder only |
| Twitch | O | O | X | O | URL builder only |
| Facebook | X | O | X | O | Type/UI only |
| Kakao | X | O | X | O | Type/UI only |

---

## 2. Files to Modify

### Phase 1: OAuth URL Builders (Frontend)

**File**: `packages/wallet/src/core/zklogin.ts`

1. Add `buildFacebookOAuthUrl()` function (~Line 225)
2. Add `buildKakaoOAuthUrl()` function (~Line 235)
3. Add cases to `buildOAuthUrl()` switch statement (Line 180-189)

### Phase 2: Salt API Lambda (Backend)

**File**: `apps/nasun-website/cdk/lambda-src/zklogin-salt/src/index.ts`

1. Add `PROVIDER_CONFIG` constant (issuer, jwksUrl per provider)
2. Modify `verifyJwt()` for multi-provider JWKS verification
3. Extend `handleGetSalt()` provider detection logic

### Phase 3: App Configuration

**Files**:
- `apps/pado/frontend/src/config/network.ts`
- `apps/pado/frontend/src/main.tsx`
- (Same pattern for other apps)

1. Add new provider clientId environment variables
2. Extend `initZkLogin()` providers configuration

### Phase 4: UI Activation

**File**: `packages/wallet-ui/src/WalletConnect.tsx`

1. Extend `providers` array (Line 884)

---

## 3. Implementation Details

### 3.1 Facebook OAuth URL Builder

```typescript
function buildFacebookOAuthUrl(clientId: string, redirectUri: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token token',
    scope: 'openid email public_profile',
    nonce: nonce,
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}
```

### 3.2 Kakao OAuth URL Builder

```typescript
function buildKakaoOAuthUrl(clientId: string, redirectUri: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',  // Kakao uses Authorization Code Flow
    scope: 'openid profile account_email',
    nonce: nonce,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params}`;
}
```

### 3.3 Salt API PROVIDER_CONFIG

```typescript
const PROVIDER_CONFIG: Record<string, { issuer: string | string[]; jwksUrl: string }> = {
  google: {
    issuer: 'https://accounts.google.com',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  apple: {
    issuer: 'https://appleid.apple.com',
    jwksUrl: 'https://appleid.apple.com/auth/keys',
  },
  twitch: {
    issuer: 'https://id.twitch.tv/oauth2',
    jwksUrl: 'https://id.twitch.tv/oauth2/keys',
  },
  facebook: {
    issuer: 'https://www.facebook.com',
    jwksUrl: 'https://www.facebook.com/.well-known/oauth/openid/jwks/',
  },
  kakao: {
    issuer: 'https://kauth.kakao.com',
    jwksUrl: 'https://kauth.kakao.com/.well-known/jwks.json',
  },
};
```

---

## 4. Environment Variables

### Frontend (.env)

```bash
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_APPLE_CLIENT_ID=com.nasun.app
VITE_TWITCH_CLIENT_ID=xxx
VITE_FACEBOOK_CLIENT_ID=xxx
VITE_KAKAO_CLIENT_ID=xxx
```

### Backend (Lambda)

```bash
ALLOWED_AUD=GOOGLE_CLIENT_ID,APPLE_CLIENT_ID,TWITCH_CLIENT_ID,FACEBOOK_CLIENT_ID,KAKAO_CLIENT_ID
```

---

## 5. Kakao Special Considerations

Kakao OIDC does **not support Implicit Flow** - Authorization Code Flow only.

### Solution: Lambda Token Exchange

1. Frontend obtains `authorization_code`
2. Send code to Lambda (new endpoint or extend existing salt endpoint)
3. Lambda calls Kakao Token API to obtain `id_token`
4. Proceed with normal Salt issuance process

### Additional Implementation Required

```typescript
// Add to Lambda
async function exchangeKakaoCode(code: string, redirectUri: string): Promise<string> {
  const response = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KAKAO_CLIENT_ID,
      client_secret: KAKAO_CLIENT_SECRET,  // From Secrets Manager
      redirect_uri: redirectUri,
      code: code,
    }),
  });
  const data = await response.json();
  return data.id_token;
}
```

---

## 6. OAuth Provider Console Setup

| Provider | Console URL | Redirect URI |
|----------|-------------|--------------|
| Apple | https://developer.apple.com/account/resources/identifiers/list/serviceIds | `https://pado.finance/callback` |
| Twitch | https://dev.twitch.tv/console/apps | `https://pado.finance/callback` |
| Facebook | https://developers.facebook.com/apps/ | `https://pado.finance/callback` |
| Kakao | https://developers.kakao.com/console/app | `https://pado.finance/callback` |

---

## 7. Implementation Order

```
Phase 1: OAuth URL Builders
├── zklogin.ts: Add Facebook/Kakao URL builders
└── Modify buildOAuthUrl() switch statement

Phase 2: Salt API Lambda
├── Add PROVIDER_CONFIG
├── Multi-provider verifyJwt() support
├── Improve handleGetSalt() provider detection
└── (Kakao) Add Token Exchange endpoint

Phase 3: App Configuration
├── Add environment variables to network.ts
└── Extend main.tsx initZkLogin

Phase 4: UI Activation
└── Extend WalletConnect.tsx providers array

Phase 5: OAuth Console Setup (separate)
└── Register apps in each provider Developer Console

Phase 6: Integration Testing
└── Verify login flow for each provider
```

---

## 8. Verification

### 8.1 Unit Tests
- Verify OAuth URL parameters per provider
- Test provider detection by JWT issuer

### 8.2 E2E Tests
1. Click login button for each provider
2. Verify OAuth redirect
3. Verify JWT receipt on callback page
4. Verify Salt API call and address generation
5. Verify wallet connection state

---

## 9. Risks and Considerations

1. **Mysten Labs Prover Compatibility**: Verify support for providers other than Google
2. **Salt Permanence**: Salt change = address change → loss of asset access
3. **Kakao Complexity**: Requires additional Token Exchange implementation
4. **Facebook OIDC**: Requires separate activation in Developer Console

---

## 10. Priority by User Base

| Rank | Provider | MAU | Implementation Effort |
|------|----------|-----|----------------------|
| 1 | Facebook | ~3B | Medium (OAuth URL builder needed) |
| 2 | Apple | ~1B+ devices | **Easy** (config only) |
| 3 | Kakao | ~50M (Korea) | High (Token Exchange needed) |
| 4 | Twitch | ~140M | **Easy** (config only) |

---

## Critical Files

| File | Changes |
|------|---------|
| `packages/wallet/src/core/zklogin.ts` | Add OAuth URL builders |
| `apps/nasun-website/cdk/lambda-src/zklogin-salt/src/index.ts` | Multi-provider JWT verification |
| `apps/pado/frontend/src/config/network.ts` | Add environment variables |
| `apps/pado/frontend/src/main.tsx` | Extend initZkLogin |
| `packages/wallet-ui/src/WalletConnect.tsx` | Extend UI providers |
