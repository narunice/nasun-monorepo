# Nasun Wallet Improvement Plan

> Version: 2.0
> Last Updated: 2025-12-29
> Status: Phase 1-5 Complete, Phase 6+ Pending

---

## Progress Overview

| Phase | Status | Completed |
|-------|--------|-----------|
| **Phase 1** - Test Foundation | ✅ Complete | 2025-12-28 |
| **Phase 2** - Multi-Token Transfer | ✅ Complete | 2025-12-28 |
| **Phase 3** - Staking | ✅ Complete | 2025-12-28 |
| **Phase 4** - NFT Support | ✅ Complete | 2025-12-28 |
| **Phase 5** - Security Features | 🔄 Partial | - |
| Phase 6 - Multi-Wallet | ⏳ Pending | - |
| Phase 7 - zkLogin | ⏳ Pending | - |
| Phase 8 - Pado Integration | ⏳ Pending | - |
| Phase 9 - Multi-Chain | ⏳ Pending | - |

---

## Current Implementation Status

### @nasun/wallet (Core Package)

| Category | Status | Tests |
|----------|--------|-------|
| Wallet Create/Lock/Unlock | ✅ | 17 |
| Balance Query | ✅ | 26 |
| Native Token Transfer | ✅ | - |
| Multi-Token Transfer | ✅ | - |
| Token Registry | ✅ | 17 |
| Staking/Unstaking | ✅ | - |
| Validator Query | ✅ | - |
| NFT Query/Transfer | ✅ | 20 |
| Address Book | ✅ | - |
| Transaction Simulation | ✅ | - |
| Encryption/Crypto | ✅ | 18 |
| **Total Tests** | - | **103** |

**Hooks (12):**
- Core: `useWallet`, `useBalance`, `useTransaction`
- Multi-Token: `useMultiBalance`, `useTokenTransaction`
- Staking: `useValidators`, `useStaking`, `useStakeTransaction`
- NFT: `useNFTs`, `useNFTTransfer`
- Security: `useAddressBook`, `useAddressStatus`

### @nasun/wallet-ui (UI Package)

| Category | Status | Tests |
|----------|--------|-------|
| WalletProvider | ✅ | - |
| WalletConnect | ✅ | - |
| BalanceDisplay | ✅ | 18 |
| MultiBalanceDisplay | ✅ | - |
| SendTransaction | ✅ | 21 |
| TokenSelector | ✅ | - |
| NFTCard | ✅ | 24 |
| NFTGallery | ✅ | - |
| NFTDetail | ✅ | - |
| NFTTransfer | ✅ | - |
| StakingPanel | ✅ | - |
| ValidatorList | ✅ | - |
| StakingStatus | ✅ | - |
| SecuritySettings | ✅ | - |
| CopyableAddress | ✅ | - |
| FaucetButton | ✅ | - |
| MnemonicBackup | ✅ | - |
| ImportWallet | ✅ | - |
| ExportPrivateKey | ✅ | - |
| AddressBookPanel | ❌ | - |
| **Total Tests** | - | **66** |

**Components: 21 implemented, 1 pending (AddressBookPanel)**

---

## Phase Details

### Phase 1: Test Foundation ✅

**Completed: 2025-12-28**
**Goal:** Establish test infrastructure for safe future development

**Implementation:**
- Vitest configuration for both packages
- 103 tests for @nasun/wallet
- 66 tests for @nasun/wallet-ui
- Mock setup for localStorage, sessionStorage, crypto API

**Test Files:**
```
packages/wallet/src/__tests__/
├── setup.ts
├── crypto.test.ts (18 tests)
├── keystore.test.ts (17 tests)
├── tokens.test.ts (17 tests)
├── client.test.ts (26 tests)
├── nft.test.ts (20 tests)
└── sanity.test.ts (3 tests)

packages/wallet-ui/src/__tests__/
├── setup.tsx
├── BalanceDisplay.test.tsx (18 tests)
├── SendTransaction.test.tsx (21 tests)
├── NFTCard.test.tsx (24 tests)
└── sanity.test.tsx (3 tests)
```

---

### Phase 2: Multi-Token Transfer ✅

**Completed: 2025-12-28**
**Goal:** Support sending any registered token (NBTC, NUSDC, etc.)

**Implementation:**
- `useTokenTransaction` hook for any token transfer
- `useMultiBalance` hook for multiple token balances
- TokenSelector integrated with SendTransaction
- Explorer link in transaction results
- Gas fee warning for non-native transfers

**Files:**
- `packages/wallet/src/hooks/useTokenTransaction.ts`
- `packages/wallet/src/hooks/useMultiBalance.ts`
- `packages/wallet/src/config/tokens.ts`
- `packages/wallet-ui/src/TokenSelector.tsx`
- `packages/wallet-ui/src/SendTransaction.tsx`
- `packages/wallet-ui/src/MultiBalanceDisplay.tsx`

**Registered Tokens:**
- NASUN (native): `0x2::sui::SUI`, 9 decimals
- NBTC: `0xfdd1...9976::nbtc::NBTC`, 8 decimals
- NUSDC: `0xfdd1...9976::nusdc::NUSDC`, 6 decimals

---

### Phase 3: Staking ✅

**Completed: 2025-12-28**
**Goal:** Native staking support with validator delegation

**Implementation:**
- `useValidators` hook for validator list with APY
- `useStaking` hook for staking positions
- `useStakeTransaction` hook for stake/unstake operations
- StakingPanel with Stake/Positions/Unstake tabs
- ValidatorList with APY, commission, pool info
- StakingStatus showing active/pending stakes

**Files:**
- `packages/wallet/src/hooks/useValidators.ts`
- `packages/wallet/src/hooks/useStaking.ts`
- `packages/wallet/src/hooks/useStakeTransaction.ts`
- `packages/wallet/src/sui/staking.ts`
- `packages/wallet/src/types/staking.ts`
- `packages/wallet-ui/src/StakingPanel.tsx`
- `packages/wallet-ui/src/ValidatorList.tsx`
- `packages/wallet-ui/src/StakingStatus.tsx`

**Features:**
- Minimum stake: 1 NASUN
- User-friendly error messages (MoveAbort code parsing)
- Epoch time warnings
- Staking summary with total staked, rewards

---

### Phase 4: NFT Support ✅

**Completed: 2025-12-28**
**Goal:** NFT viewing and transfer capabilities

**Implementation:**
- `useNFTs` hook for owned NFT list with pagination
- `useNFTTransfer` hook for NFT transfers
- NFTCard with image, name, collection
- NFTGallery with grid layout (2-4 columns)
- NFTDetail modal with full metadata
- NFTTransfer with confirmation flow

**Files:**
- `packages/wallet/src/hooks/useNFTs.ts`
- `packages/wallet/src/hooks/useNFTTransfer.ts`
- `packages/wallet/src/sui/nft.ts`
- `packages/wallet/src/types/nft.ts`
- `packages/wallet-ui/src/NFTCard.tsx`
- `packages/wallet-ui/src/NFTGallery.tsx`
- `packages/wallet-ui/src/NFTDetail.tsx`
- `packages/wallet-ui/src/NFTTransfer.tsx`

---

### Phase 5: Security Features 🔄

**Status: Partial**
**Goal:** Enhanced security with address book and transaction warnings

**Implemented:**
- `useAddressBook` hook (Zustand + persist)
- `useAddressStatus` convenience hook
- `simulateTransaction` for gas estimation
- `SecuritySettings` UI (auto-lock, large tx confirmation)
- `CopyableAddress` with copy/explorer links
- First-time recipient warning in SendTransaction

**Pending:**
- `AddressBookPanel` UI component

**Files (Implemented):**
- `packages/wallet/src/hooks/useAddressBook.ts`
- `packages/wallet/src/sui/client.ts` (simulateTransaction)
- `packages/wallet-ui/src/SecuritySettings.tsx`
- `packages/wallet-ui/src/CopyableAddress.tsx`

**Files (Pending):**
- `packages/wallet-ui/src/AddressBookPanel.tsx`

---

### Phase 6: Multi-Wallet ⏳

**Status: Pending**
**Goal:** Manage multiple wallet accounts

**Planned Features:**
- KeystoreManager for multiple keystores
- `useWallets` hook for wallet list
- WalletSelector dropdown
- WalletSettings for per-wallet config
- Wallet naming and color coding

**Files (Planned):**
- `packages/wallet/src/core/keystoreManager.ts`
- `packages/wallet/src/hooks/useWallets.ts`
- `packages/wallet-ui/src/WalletSelector.tsx`
- `packages/wallet-ui/src/WalletSettings.tsx`

**Complexity:** High
**Dependency:** Phase 1-5

---

### Phase 7: zkLogin ⏳

**Status: Pending**
**Goal:** Social login for seedless onboarding

**Prerequisites:**
- [ ] Nasun Devnet zkLogin support confirmation
- [ ] ZK proof generation server
- [ ] OAuth client registration (Google, Apple)

**Planned Features:**
- Google, Apple OAuth integration
- Ephemeral keypair management
- ZK proof generation and verification
- Link zkLogin account to existing wallet

**Complexity:** Very High
**Dependency:** Phase 1-6, Nasun Devnet zkLogin support

---

### Phase 8: Pado Integration ⏳

**Status: Pending**
**Goal:** Deep integration with Pado trading platform

**Planned Features:**
- Smart Account (BalanceManager) integration
- Unified balance view (wallet + margin)
- Batch transaction signing
- Wallet Standard for dApp connection
- Activity feed (trades, transfers, staking)

**Complexity:** High
**Dependency:** Pado development progress

---

### Phase 9: Multi-Chain ⏳

**Status: Pending (Long-term)**
**Goal:** Support for other chains (Sui mainnet, EVM)

**Considerations:**
- Current: Nasun-only
- Future: Sui mainnet compatibility
- EVM support after bridge deployment

---

## Priority Matrix

### High Priority (Next)

| Task | Effort | Impact |
|------|--------|--------|
| AddressBookPanel UI | Low | Medium |
| Test coverage expansion | Medium | High |

### Medium Priority

| Task | Effort | Impact |
|------|--------|--------|
| Multi-Wallet (Phase 6) | High | Medium |
| i18n support | Medium | Medium |

### Low Priority (Long-term)

| Task | Effort | Impact |
|------|--------|--------|
| zkLogin (Phase 7) | Very High | High |
| Pado Integration (Phase 8) | High | Medium |
| Multi-Chain (Phase 9) | Very High | Low |

---

## Design Principles

1. **Nasun-First:** Currently Nasun network only, multi-chain is long-term
2. **Separation of Concerns:** Wallet is infrastructure, Pado is superapp
3. **Incremental Development:** Test-driven, stable releases
4. **Built-in Staking:** Basic staking in wallet, advanced features in Pado

---

## Key Files Reference

### @nasun/wallet
- `src/hooks/useWallet.ts` - Core state management
- `src/core/keystore.ts` - Key storage
- `src/hooks/useTransaction.ts` - Transaction handling
- `src/hooks/useAddressBook.ts` - Address book management
- `src/sui/staking.ts` - Staking RPC utilities
- `src/types/index.ts` - Type definitions

### @nasun/wallet-ui
- `src/WalletConnect.tsx` - Main wallet UI
- `src/SendTransaction.tsx` - Transfer UI
- `src/StakingPanel.tsx` - Staking UI
- `src/SecuritySettings.tsx` - Security settings

---

## References

### 2025 Web3 Wallet Trends
- [Alchemy Web3 Wallets Guide](https://www.alchemy.com/overviews/web3-wallets)
- [Lampros Tech Web3 Wallets 2025](https://lampros.tech/blogs/best-web3-wallets-2025)

### Sui zkLogin
- [Sui zkLogin Docs](https://docs.sui.io/concepts/cryptography/zklogin)
- [zkLogin Integration Guide](https://docs.sui.io/guides/developer/cryptography/zklogin-integration)
