# Nasun Website Authentication Architecture

**Last Updated**: 2026-02-24
**Status**: Implemented ✅ (Telegram Channel Verification added)

## 1. Overview
This document describes the authentication architecture for the Nasun Website. The authentication system has been refactored to specific domain features under `src/features/auth`, providing high cohesion and a strict public API.

## 2. Architecture

### Directory Structure
The authentication logic is centralized in **`src/features/auth/`**:

```
src/features/auth/
├── components/    # UI Components (Callback.tsx, WalletLoginButton.tsx, etc.)
├── providers/     # Context Providers (AuthProvider.tsx)
├── hooks/         # Business Logic Hooks (useAuth.ts, etc.)
├── types/         # Type Definitions
├── utils/         # Auth Utilities (Cognito, Token Logic)
└── index.ts       # Public API Entry Point
```

### Public API (`index.ts`)
Only the following modules are exposed for external use:
- `AuthProvider`: Wraps the application to provide auth context.
- `useAuth`: Hook to access auth state (user, login, logout).
- `WalletLoginButton`: UI component for wallet login.
- `Callback`: Route component for handling OAuth callbacks.

### Technology Stack
- **Primary Auth**: AWS Cognito (Identity Pool)
- **Identity Providers**:
  - **Google**: Native Cognito integration.
  - **X (Twitter)**: Custom Lambda API (`nasun-auth-api`) -> OpenID Connect / Developer Identity.
  - **MetaMask**: Custom Lambda API (`nasun-auth-api`) -> Signature Verification -> Developer Identity.
  - **Telegram**: Login Widget -> LeaderboardV3Stack Lambda (`verify-telegram`) -> Account Linking (no Cognito Identity created).

## 3. Integration Guide

### How to use `useAuth`
```typescript
import { useAuth } from '@/features/auth';

const MyComponent = () => {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) return <button onClick={login}>Login</button>;
  return <div>Welcome, {user.username} <button onClick={logout}>Logout</button></div>;
};
```

### How to add a new provider
1. Add the provider logic in `utils/authApi.ts`.
2. Update `AuthProvider.tsx` to handle the new provider state.
3. Create a login button in `components/`.
4. Export if necessary.

### Telegram Integration (Account Linking)

Telegram is **not** a standalone identity provider — it links to an existing authenticated account. The integration lives in **LeaderboardV3Stack**, not in the auth feature module.

**Architecture**:
```
[My Account Page] → Telegram Login Widget (popup)
    ↓ auth data (id, username, auth_date, hash)
[verify-telegram Lambda]
    ├── HMAC-SHA256 hash verification (Bot Token)
    ├── auth_date freshness check (≤ 5 min)
    ├── Telegram Bot API: getChatMember (channel membership)
    ├── GSI Query: telegramUserId-index (duplicate check)
    └── DynamoDB update: UserProfiles + Accounts + SeasonAccounts
```

**Key files**:
- Backend: `cdk/lambda-src/leaderboard-v3/src/handlers/verify-telegram.ts`
- Frontend: `frontend/src/sections/myAccount/hooks/useTelegramVerify.tsx`
- CDK: `cdk/lib/leaderboard-v3-stack.ts`

**Why in LeaderboardV3Stack?**
- `verify-telegram` needs write access to UserProfiles, Accounts, and SeasonAccounts tables
- `link-account` Lambda lacks Accounts/SeasonAccounts permissions
- Keeps all Telegram logic co-located (verify, status, disconnect)

## 4. Security
- **Token Storage**: Tokens are managed securely (Cognito handles session management).
- **Protected Routes**: Use `useAuth` to check `isAuthenticated` state before rendering protected content.

## 5. History
- **2026-02-24**: Telegram Channel Verification added (LeaderboardV3Stack). Login Widget + Bot API + GSI optimization.
- **2026-01-01**: Refactoring completed. Unified scattered logic from `src/providers` and `src/hooks` into `src/features/auth`.
