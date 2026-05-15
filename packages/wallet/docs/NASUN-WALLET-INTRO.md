# Nasun Wallet

Your gateway to the Nasun Network — a self-custody wallet built directly into every Nasun app.

No extensions. No downloads. No seed phrase headaches. Just open a Nasun app and you're ready.

---

## 3 Ways to Connect

Choose how you want to use Nasun Wallet. All three methods give you full access to every feature.

### 1. Google Login (Recommended for Beginners)

Sign in with your Google account. That's it.

Behind the scenes, Nasun uses **zkLogin** — a zero-knowledge proof system that creates a blockchain wallet tied to your Google identity, without ever exposing your personal information on-chain.

- No seed phrase to write down
- No password to remember
- Works on any browser
- Your Google account IS your wallet

**How it works:** When you sign in, a temporary cryptographic key is created on your device. A zero-knowledge proof links this key to your Google identity without revealing who you are. The blockchain only sees the proof — never your email or name.

### 2. Passkey / Biometric Wallet

Use your fingerprint, face, or device PIN to create and unlock your wallet.

Built on the **WebAuthn** standard — the same technology that secures your banking apps. Your private key is encrypted and can only be unlocked with your biometrics.

- Face ID, Touch ID, Windows Hello, or device PIN
- No password needed on supported devices
- Encrypted backup with recovery phrase
- Works on Chrome, Safari, and Edge

**How it works:** When you set up a Passkey wallet, your device's secure hardware generates a credential that protects your wallet's encryption key. On supported browsers (Chrome 120+, Safari 18+), the key material never leaves your device's security chip. On other browsers, a backup password adds an extra layer of protection.

### 3. Password Wallet (Advanced)

The traditional approach — create a wallet with a password, back up your 12-word recovery phrase.

- Full control over your keys
- Export private key anytime
- Import existing wallets (mnemonic or private key)
- Best for users who want maximum sovereignty

---

## What You Can Do

### Send & Receive Tokens

Transfer NASUN, NBTC, and NUSDC tokens to any address. Scan QR codes or paste addresses. Real-time balance updates across all your tokens.

### Faucet (Devnet)

Get free test tokens instantly. One tap to fund your wallet on the Nasun Devnet.

### Stake & Earn

Delegate your NASUN tokens to validators and earn staking rewards. View validator performance, APY, and commission rates. Unstake anytime.

### NFT Gallery

View, manage, and transfer your NFTs. Full support for the Display standard with IPFS image rendering.

### Portfolio Overview

Track your total portfolio value across all tokens with 24-hour change indicators.

### Nasun Link

Create shareable links that contain tokens. Anyone with the link can claim the tokens — perfect for airdrops, rewards, and community distribution.

### Transaction History

Full record of all your transactions with details on gas fees, status, and involved addresses.

---

## Security

Nasun Wallet runs entirely in your browser. Your private keys are encrypted on your device and never sent to any server.

| Layer | Protection |
|-------|------------|
| Encryption | AES-256-GCM — the same standard used by governments and banks |
| Key Derivation | PBKDF2 with 100,000 iterations — makes brute-force attacks impractical |
| Brute Force Defense | Progressive lockout — 8 wrong attempts locks for 30s, 12 for 5min, 16+ for 30min |
| Memory Safety | Private keys are zeroed from memory after use |
| Passkey (PRF) | Encryption key derived from device hardware — never stored, never transmitted |
| zkLogin | Zero-knowledge proofs — blockchain never sees your identity |

**What Nasun Wallet does NOT do:**

- Does NOT send your keys to any server
- Does NOT require browser extensions
- Does NOT track your activity
- Does NOT have access to your Google account (zkLogin uses a one-way proof)

---

## Supported Platforms

| Browser | Google Login | Passkey | Password Wallet |
|---------|:-----------:|:-------:|:---------------:|
| Chrome (Desktop) | Yes | Yes (PRF) | Yes |
| Chrome (Android) | Yes | Yes (PRF) | Yes |
| Safari (macOS) | Yes | Yes | Yes |
| Safari (iOS) | Yes | Yes | Yes |
| Edge | Yes | Yes (PRF) | Yes |
| Firefox | Yes | No* | Yes |
| Brave | Yes | Yes | Yes |

*Firefox does not yet support the WebAuthn platform authenticator required for Passkey wallets.

---

## Recovery & Backup

Your tokens live on the blockchain, not on your device. If you lose access, you can always recover — as long as you have a backup.

| Method | Recovery Options | How |
|--------|-----------------|-----|
| Google Login | Automatic | Sign in with the same Google account on any device |
| Passkey Wallet | Recovery phrase or exported private key | Use the 12-word phrase shown at creation, or export your private key from Settings |
| Password Wallet | Recovery phrase or exported private key | Use the 12-word phrase shown at creation, or export your private key from Settings |

### Google Login

Nothing to back up. Your wallet is tied to your Google account. Sign in from any browser, on any device, and your wallet is there.

### Passkey & Password Wallets

When you create a Passkey or Password wallet, you are shown a **12-word recovery phrase**. This is the master backup of your wallet.

- **Save it immediately** — write it down on paper, store it in a password manager, or use any secure method.
- If you lose both your device and the recovery phrase, your wallet **cannot be recovered**.

You can also **export your private key** at any time from the wallet menu:
- **Password Wallet:** Enter your password to export.
- **Passkey Wallet:** Verify with biometrics to export.

The exported key (`suiprivkey1...`) can be used to restore your wallet via the "Import Wallet" option.

---

## FAQ

**Q: What happens if I lose my device?**

- **Google Login:** Sign in with the same Google account on any device.
- **Passkey Wallet:** Use your 12-word recovery phrase (shown at creation) to restore your wallet, or import a previously exported private key.
- **Password Wallet:** Use your 12-word recovery phrase to restore on any device, or import a previously exported private key.

**Q: Can I use multiple login methods?**

Each login method creates a separate wallet address. You can use Google Login on one device and Passkey on another, but they will have different addresses and balances.

**Q: Is my Google account at risk with zkLogin?**

No. zkLogin uses a mathematical proof to verify your identity without exposing it. The blockchain sees a cryptographic proof — not your email, name, or any personal data. Even if someone reads the blockchain, they cannot determine which Google account created the wallet.

**Q: What is the Nasun Network?**

Nasun is a high-performance Layer 1 blockchain built on the Move programming language. It features sub-second finality, object-centric data model, and native support for sponsored transactions. Nasun Wallet is the built-in wallet for all Nasun applications.

**Q: Are my tokens real?**

Currently, Nasun is running on **Devnet** — a test network for development and community testing. Tokens on Devnet have no monetary value. When Nasun launches on Mainnet, real-value tokens will be supported.

---

*Nasun Wallet is open for community testing. Report issues or share feedback on [GitHub](https://github.com/anthropics/claude-code/issues).*
