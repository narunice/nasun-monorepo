# zkLogin Multi-Provider Implementation Plan

> Created: 2026-01-18
> Status: **PARTIALLY IMPLEMENTED**
> Target: Apple, Twitch, Facebook, Kakao

---

## 1. Overview

Plan to add 4 additional OAuth providers to the zkLogin authentication system.

### Current Implementation State

| Provider | OAuth URL Builder | detectProvider | Salt API | UI Button | Status |
|----------|-------------------|----------------|----------|-----------|--------|
| Google | **Implemented** | **Implemented** | **Implemented** | **Implemented** | **Production** |
| Apple | **Implemented** | **Implemented** | Pending | Pending | URL builder ready |
| Twitch | **Implemented** | **Implemented** | Pending | Pending | URL builder ready |
| Facebook | Pending | Partially Impl | Pending | Pending | Type detection only |
| Kakao | Pending | Partially Impl | Pending | Pending | Type detection only |

**Implemented Files:**
- `packages/wallet/src/core/zklogin.ts`: Contains `buildOAuthUrl` for Google, Apple, and Twitch. Contains `detectProvider` logic for all target providers.

---

## 2. Remaining Work

### Phase 1: Facebook & Kakao Support
- Implement `buildFacebookOAuthUrl` and `buildKakaoOAuthUrl` in `zklogin.ts`.
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

1. **Apple**: High priority (Mobile users). Code is mostly ready.
2. **Twitch**: Medium priority. Code is mostly ready.
3. **Facebook/Kakao**: Lower priority. Requires more dev effort.