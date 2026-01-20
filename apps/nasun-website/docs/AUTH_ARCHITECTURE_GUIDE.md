# Nasun Website Authentication Architecture

**Last Updated**: 2026-01-20
**Status**: Implemented ✅

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

## 4. Security
- **Token Storage**: Tokens are managed securely (Cognito handles session management).
- **Protected Routes**: Use `useAuth` to check `isAuthenticated` state before rendering protected content.

## 5. History
- **2026-01-01**: Refactoring completed. Unified scattered logic from `src/providers` and `src/hooks` into `src/features/auth`.
