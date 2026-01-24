# zkLogin Multi-Provider Implementation Plan

> Last Updated: 2026-01-24
> Status: **PARTIALLY IMPLEMENTED (3/5 providers)**
> Target: Apple, Twitch, Facebook, Kakao

---

## 1. Overview

Plan to add 4 additional OAuth providers to the zkLogin authentication system.

### Current Implementation State

| Provider | OAuth URL Builder | detectProvider | JWKS/Issuer Config | Salt API | UI Button | Status |
|----------|-------------------|----------------|-------------------|----------|-----------|--------|
| Google | **Implemented** | **Implemented** | **Implemented** | **Implemented** | **Implemented** | **Production** |
| Apple | **Implemented** | **Implemented** | **Implemented** | Pending | Pending | Backend needed |
| Twitch | **Implemented** | **Implemented** | **Implemented** | Pending | Pending | Backend needed |
| Facebook | Pending | Implemented (issuer detection) | Not configured | Pending | Pending | URL builder needed |
| Kakao | Pending | Implemented (issuer detection) | Not configured | Pending | Pending | URL builder needed |

**Implemented Files:**
- `packages/wallet/src/core/zklogin.ts`:
  - `buildOAuthUrl` dispatches to Google, Apple, Twitch URL builders
  - `detectProvider` detects all 5 providers from JWT `iss` claim
  - `JWKS_URLS` configured for Google, Apple, Twitch
  - `EXPECTED_ISSUERS` configured for Google, Apple, Twitch

---

## 2. Remaining Work

### Phase 1: Facebook & Kakao URL Builders
- Implement `buildFacebookOAuthUrl` and `buildKakaoOAuthUrl` in `zklogin.ts`.
- Add JWKS URLs and expected issuers for Facebook and Kakao.
- Kakao requires Authorization Code Flow handling (Token Exchange).

### Phase 2: Backend (Salt API)
- Update Salt API Lambda to verify JWTs from new providers (`jwksUrl`, `issuer`).

### Phase 3: Configuration
- Add Client IDs for new providers to `network.ts` and `.env`.

### Phase 4: UI Activation
- Enable buttons in `WalletConnect.tsx` or `SocialLoginButtons.tsx`.

---

## 3. Implementation Details (Reference)

### Kakao Token Exchange Strategy
Kakao OIDC only supports Authorization Code Flow.
1. Frontend receives `code`.
2. Frontend sends `code` to Backend.
3. Backend exchanges `code` for `id_token`.
4. Backend proceeds with Salt generation.

---

## 4. Priority

1. **Apple**: High priority (Mobile users). URL builder + JWKS ready. Only Salt API + UI activation needed.
2. **Twitch**: Medium priority. URL builder + JWKS ready. Only Salt API + UI activation needed.
3. **Facebook/Kakao**: Lower priority. Requires URL builder, JWKS config, and Salt API.