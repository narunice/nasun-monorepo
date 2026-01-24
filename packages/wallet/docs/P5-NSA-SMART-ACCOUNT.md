# Nasun Smart Account (NSA) & Trinity Recovery

> Last Updated: 2026-01-24
> Status: **IMPLEMENTED** (Pending Devnet Deployment)
> Package: @nasun/wallet + apps/pado/contracts-nsa

---

## 1. Problem Statement

zkLogin provides excellent onboarding UX (login with Google/Apple), but introduces a critical structural risk:

**If the user loses access to their OAuth account, they permanently lose access to their on-chain assets.**

There is no recovery path in a pure zkLogin architecture because the derived address is deterministically bound to the OAuth identity.

---

## 2. Solution: Account-Key Separation

NSA separates **account identity** (SmartAccount object that holds assets) from **signing keys** (addresses that can operate on the account).

```
Traditional Wallet:     zkLogin Address = Asset Holder = Single Point of Failure
NSA Architecture:       SmartAccount (Vault) <-- Multiple Signers (Rotatable Keys)
```

This means:
- Assets remain in the SmartAccount regardless of which key is active
- Lost keys can be rotated without moving assets
- Multiple authentication paths provide redundancy

---

## 3. Trinity Recovery Model

| Tier | Mechanism | Scenario | Recovery Time |
|------|-----------|----------|---------------|
| 1 | Multipath Login (1-of-N) | Lost Google? Use Passkey | Instant |
| 2 | Encrypted Cloud Backup | Lost all devices? PIN + backup file | Minutes |
| 3 | Guardian Social Recovery | Lost everything? N-of-M guardians + timelock | 48+ hours |

### Tier 1: Multipath Login
Multiple signers registered to the same SmartAccount. If one key is lost, any other registered signer can still operate the account.

### Tier 2: Encrypted Backup
Private key encrypted with user's PIN using PBKDF2 (600K iterations) + AES-256-GCM. Stored as a downloadable JSON file. Decryption happens entirely client-side.

### Tier 3: Guardian Social Recovery
Trusted contacts (guardians) can collectively vote to rotate the account's signers to a pre-approved recovery address. Protected by:
- **N-of-M threshold**: Minimum 2 guardians must approve
- **48-hour timelock**: Owner can cancel during this window
- **Sovereign constraint**: Recovery target must match pre-set `recovery_owner`

---

## 4. On-Chain Architecture

### SmartAccount (Shared Object)

```
SmartAccount {
  id: UID                              // Unique object identity
  signers: VecMap<address, SignerInfo>  // Up to 5 authorized signers
  threshold: u8                        // Signing threshold (1-of-N default)
  guardians: vector<address>           // Up to 5 guardians
  guardian_threshold: u8               // N-of-M for recovery (min 2)
  recovery_owner: address              // Pre-approved recovery target
  nonce: u64                           // Replay protection
  assets: Bag                          // Heterogeneous Balance<T> storage
  created_at: u64                      // Timestamp
}
```

**Why Shared Object?** Multiple signer addresses need to interact with the same account. Shared objects enable multi-party access without ownership transfer.

**Why Bag for assets?** `Bag` supports heterogeneous storage, allowing the same account to hold `Balance<NSN>`, `Balance<NBTC>`, `Balance<NUSDC>`, etc. without fixed type parameters.

### RecoveryRequest (Shared Object)

```
RecoveryRequest {
  id: UID
  account_id: ID                       // Target SmartAccount
  requester: address                   // Guardian who initiated
  new_owner: address                   // Must match recovery_owner
  approvals: vector<address>           // Guardians who approved
  required_approvals: u8               // Threshold from account
  timelock_end: u64                    // Unix timestamp (ms)
  is_executed: bool
  is_cancelled: bool
  created_at: u64
}
```

### Security Properties

| Threat | Mitigation |
|--------|-----------|
| Replay attack | `nonce` field incremented on rotation |
| Guardian collusion | N-of-M threshold (minimum 2) |
| Fast takeover | 48-hour timelock (owner can cancel) |
| Arbitrary recovery target | Sovereign: must match pre-set `recovery_owner` |
| Last signer removal | Contract prevents removing the final signer |
| Guardian-signer overlap | Contract prevents same address being both |
| Admin key extraction | No admin key; timelock is hardcoded |

---

## 5. Frontend Architecture

### Module Structure

```
packages/wallet/src/
├── types/nsa.ts                          # Shared TS types
├── core/nsa/
│   ├── types.ts                          # Operation param types
│   ├── client.ts                         # On-chain queries + TX builders
│   ├── backup.ts                         # PBKDF2+AES backup
│   ├── recovery.ts                       # Recovery status helpers
│   └── index.ts                          # Module exports
├── core/signer/adapters/NsaSigner.ts     # Signer adapter
├── stores/nsaStore.ts                    # Zustand (localStorage)
└── hooks/
    ├── useNasunSmartAccount.ts           # Main account hook
    ├── useNsaRecovery.ts                 # Recovery flow hook
    └── useNsaBackup.ts                   # Backup hook
```

### NsaSigner Adapter

Wraps an underlying signer (zkLogin or Local) and adds SmartAccount context:

```typescript
import { useNasunSmartAccount } from '@nasun/wallet';

const { createAccount, deposit, withdraw, addSigner } = useNasunSmartAccount();

// Create account (first time)
const objectId = await createAccount('zklogin', 'primary-key', currentSigner);

// Deposit tokens
await deposit('0x2::sui::SUI', coinObjectId, currentSigner);

// Withdraw
await withdraw('0x2::sui::SUI', 1_000_000_000n, recipientAddr, currentSigner);

// Add passkey as second signer
await addSigner(passkeyAddress, 'passkey', 1, 'face-id', currentSigner);
```

### Recovery Flow

```typescript
import { useNsaRecovery } from '@nasun/wallet';

const {
  status,              // 'idle' | 'pending_approvals' | 'timelock_active' | 'ready_to_execute'
  timelockDisplay,     // "23h 45m remaining"
  approvalsNeeded,     // Number of remaining approvals
  initiateRecovery,    // Guardian starts recovery
  approveRecovery,     // Another guardian approves
  executeRecovery,     // Anyone executes after timelock
  cancelRecovery,      // Owner cancels during timelock
} = useNsaRecovery();
```

### Backup Flow

```typescript
import { useNsaBackup } from '@nasun/wallet';

const { createNsaBackup, restoreNsaBackup, downloadBackup } = useNsaBackup();

// Create and download backup
const backup = await createNsaBackup(privateKeyBase64, signerAddress, '123456');
downloadBackup(backup);  // Triggers file download

// Restore from backup file
const { signerPrivateKey, accountObjectId } = await restoreNsaBackup(backupData, '123456');
```

---

## 6. Signer Priority

When NSA is configured, `useSigner` auto-registers `NsaSigner` and uses the following priority on Move chains:

```
nsa > local > zklogin
```

This ensures SmartAccount-aware transactions are built by default when the user has an NSA account.

---

## 7. Deployment Status

| Component | Status |
|-----------|--------|
| `smart_account.move` | Implemented, build verified |
| `recovery.move` | Implemented, build verified |
| `core/nsa/` module | Implemented, TypeScript verified |
| Hooks (3) | Implemented |
| Store | Implemented |
| Devnet deployment | Pending |
| UI integration | Phase 3-4 (planned) |
| E2E tests | Phase 5 (planned) |

### Post-Deployment Checklist

1. Publish contract: `sui client publish --gas-budget 100000000`
2. Update `NSA_PACKAGE_ID` in `packages/wallet/src/types/nsa.ts`
3. Verify shared object creation via explorer
4. Test create_account + deposit + withdraw flow
5. Test guardian setup + recovery initiation + cancel
6. Test full recovery flow (48h timelock on devnet can be reduced for testing)
