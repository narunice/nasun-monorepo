# Nasun Wallet UI Mockup

Current state of the wallet UI components in `@nasun/wallet-ui`.

Last updated: 2026-01-25

---

## 1. Disconnected State (Initial)

```
┌─────────────────────────────────────┐
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Quick Start      [Recommended]│  │
│  │  No seed phrase needed         │  │
│  │                                │  │
│  │  [G] Sign in with Google       │  │
│  └───────────────────────────────┘  │
│                                     │
│        OR USE TRADITIONAL WALLET    │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  [+] Create Password Wallet   │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  [↓] Import Existing Wallet   │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `main` (with no wallet)

**Changes (2026-01-25)**:
- zkLogin moved to top as "Quick Start (Recommended)"
- Added "No seed phrase needed" messaging
- Traditional wallet options positioned below

---

## 2. Locked State

```
┌─────────────────────────────────────┐
│                                     │
│           [Lock Icon]               │
│                                     │
│         Wallet Locked               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Password                     │  │
│  │  ••••••••                     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │          Unlock               │  │
│  └───────────────────────────────┘  │
│                                     │
│         Forgot password?            │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `unlock`

---

## 3. Unlocked State - Tokens Tab (Main View)

```
┌─────────────────────────────────────┐
│  [<] Nasun Wallet            [···]  │  <- Header with dropdown menu
├─────────────────────────────────────┤
│                                     │
│           $1,234.56                 │  <- Total balance (USD)
│         1,000.00 NASUN              │  <- Primary token
│                                     │
│  0x1234...5678              [Copy]  │  <- Address (truncated)
│                                     │
├─────────────────────────────────────┤
│  [Tokens]   [NFTs]   [History]      │  <- Tab navigation
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [N] NASUN                   │    │
│  │     1,000.00      $1,200.00 │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [B] NBTC                    │    │
│  │     0.05           $34.56   │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [U] NUSDC                   │    │
│  │     100.00        $100.00   │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  [  Send  ]     [  Receive  ]       │  <- Action buttons
│                                     │
│  [  Faucet  ]                       │  <- Devnet only
└─────────────────────────────────────┘
```

**ViewMode**: `main`
**TabMode**: `tokens`

---

## 4. Unlocked State - NFTs Tab

```
┌─────────────────────────────────────┐
│  [<] Nasun Wallet            [···]  │
├─────────────────────────────────────┤
│           $1,234.56                 │
│         1,000.00 NASUN              │
│  0x1234...5678              [Copy]  │
├─────────────────────────────────────┤
│  [Tokens]   [NFTs]   [History]      │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────┐  ┌─────────┐           │
│  │  NFT 1  │  │  NFT 2  │           │
│  │ [Image] │  │ [Image] │           │
│  │ Name    │  │ Name    │           │
│  └─────────┘  └─────────┘           │
│                                     │
│  ┌─────────┐  ┌─────────┐           │
│  │  NFT 3  │  │  NFT 4  │           │
│  │ [Image] │  │ [Image] │           │
│  │ Name    │  │ Name    │           │
│  └─────────┘  └─────────┘           │
│                                     │
│         (2x2 Grid Layout)           │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `main`
**TabMode**: `nfts`

---

## 5. Unlocked State - History Tab

```
┌─────────────────────────────────────┐
│  [<] Nasun Wallet            [···]  │
├─────────────────────────────────────┤
│           $1,234.56                 │
│         1,000.00 NASUN              │
│  0x1234...5678              [Copy]  │
├─────────────────────────────────────┤
│  [Tokens]   [NFTs]   [History]      │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [↑] Sent NASUN              │    │
│  │     -100.00      2 min ago  │    │
│  │     To: 0xabcd...efgh       │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [↓] Received NBTC           │    │
│  │     +0.01        1 hour ago │    │
│  │     From: 0x9876...5432     │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [↑] Sent NUSDC              │    │
│  │     -50.00       Yesterday  │    │
│  │     To: 0xdef0...1234       │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `main`
**TabMode**: `history`

---

## 6. zkLogin State

```
┌─────────────────────────────────────┐
│  [<] Nasun Wallet            [···]  │
├─────────────────────────────────────┤
│                                     │
│         [Google Avatar]             │
│                                     │
│         user@gmail.com              │  <- Google email
│           (zkLogin)                 │  <- Auth type badge
│                                     │
│           $1,234.56                 │
│         1,000.00 NASUN              │
│                                     │
│  0x1234...5678              [Copy]  │
│                                     │
├─────────────────────────────────────┤
│  [Tokens]   [NFTs]   [History]      │
├─────────────────────────────────────┤
│  ... (same as Tokens tab) ...       │
├─────────────────────────────────────┤
│  [  Send  ]     [  Receive  ]       │
│  [  Faucet  ]                       │
└─────────────────────────────────────┘
```

**ViewMode**: `main`
**Auth Type**: `zklogin`

---

## 7. Dropdown Menu (Expanded) - Updated 2026-01-25

```
┌─────────────────────────────────────┐
│  [<] Nasun Wallet            [×]    │  <- Close button when open
├─────────────────────────────────────┤
│ QUICK ACTIONS                       │
│  [↑] Send Token                     │
│  [↓] Receive                        │
├─────────────────────────────────────┤
│ PORTFOLIO                           │
│  [📊] Portfolio                     │
│  [💰] Staking                       │
│  [🔗] Create Link                   │
├─────────────────────────────────────┤
│ ACCOUNT                             │
│  [📋] Address Book                  │
│  [🛡] Smart Account     [2/3]       │  <- Recovery readiness badge
│  [⚙] Security Settings             │  <- Local wallet only
│  [🔑] Export Private Key            │  <- Local wallet only
├─────────────────────────────────────┤
│                      [🔒 Lock]      │
└─────────────────────────────────────┘
```

**Changes (2026-01-25)**:
- Added section headers (Quick Actions, Portfolio, Account)
- Smart Account shows Recovery Readiness badge (X/3)

---

## 8. Smart Account Info Screen

```
┌─────────────────────────────────────┐
│  [<] Smart Account                  │
├─────────────────────────────────────┤
│                                     │
│  Account ID                         │
│  0x1234567890...abcdef   [Copy]     │
│                                     │
├─────────────────────────────────────┤
│  Recovery Readiness                 │
│  ┌───────────────────────────────┐  │
│  │  [✓] Multipath                │  │  <- 2+ signers
│  │  [ ] Backup                   │  │  <- Encrypted backup
│  │  [ ] Guardian                 │  │  <- Recovery guardian
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  Signers (2)              Threshold: 1
│  ┌───────────────────────────────┐  │
│  │ Primary (zkLogin)     Wt: 1   │  │
│  │ 0xabc123...  [YOU]            │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Backup (Local)        Wt: 1   │  │
│  │ 0xdef456...                   │  │
│  └───────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  Pending Proposals (1)              │
│  ┌───────────────────────────────┐  │
│  │ "Family Member"   Expires: 2d │  │
│  │ 0x789abc...                   │  │
│  │        [Accept]    [Cancel]   │  │
│  └───────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  Guardians (0)                      │
│  No guardians configured            │
│                                     │
├─────────────────────────────────────┤
│  Actions                            │
│  ┌───────────────────────────────┐  │
│  │ [+] Add Signer                │  │
│  │ [↓] Create Backup             │  │
│  │ [🛡] Setup Guardian           │  │
│  │ [⚙] Update Threshold          │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `nsa-info`

---

## 9. Send Transaction Screen

```
┌─────────────────────────────────────┐
│  [<] Send                           │
├─────────────────────────────────────┤
│                                     │
│  Token                              │
│  ┌───────────────────────────────┐  │
│  │ [N] NASUN              [▼]    │  │  <- Token selector
│  │     Balance: 1,000.00         │  │
│  └───────────────────────────────┘  │
│                                     │
│  Amount                             │
│  ┌───────────────────────────────┐  │
│  │                          MAX  │  │
│  │  100                          │  │
│  └───────────────────────────────┘  │
│                                     │
│  Recipient                          │
│  ┌───────────────────────────────┐  │
│  │  0x...                        │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │         Send NASUN            │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `send`

---

## 10. Receive Screen

```
┌─────────────────────────────────────┐
│  [<] Receive                        │
├─────────────────────────────────────┤
│                                     │
│         ┌─────────────┐             │
│         │             │             │
│         │  [QR Code]  │             │
│         │             │             │
│         └─────────────┘             │
│                                     │
│  Your Address                       │
│  ┌───────────────────────────────┐  │
│  │ 0x1234567890abcdef...    [📋] │  │
│  └───────────────────────────────┘  │
│                                     │
│  Scan QR code or copy address       │
│  to receive tokens                  │
│                                     │
└─────────────────────────────────────┘
```

**ViewMode**: `receive`

---

## ViewMode State Machine

All possible ViewMode values in `WalletConnect.tsx`:

| ViewMode | Description |
|----------|-------------|
| `main` | Default view with balance and tabs |
| `create` | New wallet creation |
| `create-password` | Set password for new wallet |
| `unlock` | Unlock locked wallet |
| `import` | Import existing wallet |
| `send` | Send tokens |
| `receive` | Receive tokens (QR + address) |
| `backup` | Mnemonic backup |
| `export-key` | Export private key |
| `nsa-info` | Smart Account info |
| `nsa-setup` | Smart Account setup wizard |
| `nsa-add-signer` | Add new signer |
| `nsa-accept-proposal` | Accept signer proposal |
| `nsa-backup` | NSA encrypted backup |
| `nsa-guardian` | Guardian setup |
| `nsa-recovery` | Recovery flow |
| `zklogin-loading` | zkLogin auth in progress |

---

## TabMode Values

| TabMode | Description |
|---------|-------------|
| `tokens` | Token balances list |
| `nfts` | NFT gallery (2x2 grid) |
| `history` | Transaction history |

---

## Component Hierarchy

```
WalletProvider
└── WalletConnect
    ├── Header (logo, dropdown trigger)
    ├── DropdownMenu (when open)
    │   ├── Smart Account
    │   ├── Backup Wallet
    │   ├── Export Private Key
    │   ├── Lock Wallet
    │   └── Disconnect
    ├── BalanceDisplay
    ├── CopyableAddress
    ├── TabNavigation
    │   ├── TokensList
    │   ├── NFTGallery
    │   └── TransactionHistory
    ├── ActionButtons (Send, Receive, Faucet)
    └── Modal Views
        ├── NsaAccountInfo
        ├── NsaSetupWizard
        ├── NsaAddSigner
        ├── NsaAcceptProposal
        ├── NsaBackupPanel
        ├── NsaGuardianSetup
        ├── NsaRecoveryPanel
        ├── SendTransaction
        ├── MnemonicBackup
        ├── ExportPrivateKey
        └── ImportWallet
```

---

## Design Notes

1. **Color Scheme**: Dark mode primary (`zinc-800`, `zinc-900`), Light mode (`gray-50`, `white`)
2. **Accent Colors**: Blue (`blue-500`, `blue-600`) for primary actions
3. **Warning Colors**: Amber for pending states, Red for errors
4. **Typography**: Monospace for addresses, Regular for labels
5. **Spacing**: 4px base unit, consistent padding (`p-3`, `p-4`)
6. **Border Radius**: `rounded` (4px) for cards, `rounded-full` for badges
