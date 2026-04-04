# Genesis Pass NFT Drop - Operations Guide

## Pre-Drop Checklist

### Contract Deployment
- [ ] Sepolia testnet full E2E test complete
- [ ] Mainnet contract deployed
- [ ] Etherscan source code verified
- [ ] contractURI set (OpenSea collection metadata)
- [ ] baseURI set (Pinata IPFS CID)
- [ ] maxSupply = 20,000 per tokenId (increase via setMaxSupply if needed)
- [ ] mintDeadline set (Unix timestamp)
- [ ] mintPrice set (wei)
- [ ] walletLimitPerStage set for each stage

### Signer Key
- [ ] Signer private key stored in AWS Secrets Manager
- [ ] Contract signer address === Secrets Manager key address
- [ ] Separate keys for testnet and mainnet

### Lambda / API
- [ ] mint-signature Lambda deployed
- [ ] SSM /nasun/genesis-pass/current-stage = "0" (PAUSED)
- [ ] CONTRACT_ADDRESS and CHAIN_ID env vars verified

### IPFS / Metadata
- [ ] 7 video files + 7 thumbnails uploaded to Pinata
- [ ] 7 metadata JSONs (1.json - 7.json) uploaded
- [ ] collection.json uploaded
- [ ] Pinata paid plan active (permanent pinning)

---

## Stage Transition Runbook

### Procedure (follow this order exactly)
1. Send `setStage(N)` on-chain transaction
2. Wait for block confirmation
3. `aws ssm put-parameter --name /nasun/genesis-pass/current-stage --value "N" --overwrite`
4. Wait 60 seconds (Lambda cache expiry)
5. Verify with test wallet mint

### Rules
- NEVER revert to a previous stage (highWaterMark enforces this on-chain)
- NEVER update SSM before on-chain tx confirms
- PUBLIC stage (4) does not require Lambda signatures (frontend mints directly)

---

## Emergency Response

### Immediate Halt
Send `setStage(0)` on-chain (PAUSED) to block all minting instantly.

### Scenario 1: Abnormal Mass Minting Detected
1. Send `setStage(0)` immediately
2. Analyze minting transactions on Etherscan
3. Determine cause and response

### Scenario 2: Signer Key Compromise Suspected
1. Send `setStage(0)` immediately
2. Wait 300 seconds (all existing signatures expire)
3. Generate new signer key
4. Update Secrets Manager
5. Redeploy Lambda
6. Call `setSigner(newAddress)` on-chain
7. Resume with `setStage(N)`

### Scenario 3: Website Down
- Lambda/API Gateway auto-scales (unlikely to go down)
- Frontend down does not affect contract operation
- PUBLIC stage: users can mint directly via Etherscan
- Allowlist stages: Lambda required (signature issuance)

### Scenario 4: RPC Node Failure
- wagmi fallback transport: Alchemy -> Cloudflare auto-switch
- Both down: instruct users to change RPC in their wallet settings

### Scenario 5: Gas Price Spike
- Mint price is fixed ETH, not affected
- If gas is excessive: `setStage(0)` to pause, resume when gas stabilizes

### Scenario 6: Event Extension
- Call `setMintDeadline(newTimestamp)` on-chain
- Announce to community before executing

### Scenario 7: Early Termination
- Call `setMintDeadline(block.timestamp)` or `setStage(0)` on-chain
- Both immediately block minting

---

## Signer Key Rotation Procedure

```
1. setStage(0) on-chain (PAUSED)
2. Wait 300 seconds (existing signatures expire)
3. Update Secrets Manager with new key
4. Redeploy Lambda (picks up new key)
5. setSigner(newAddress) on-chain
6. setStage(N) on-chain (resume minting)
```

---

## Community Announcements

### Pre-Drop
- Official minting page: https://nasun.io/wave1/nft-drop
- Any other link is a scam
- Supported wallets: MetaMask, Rainbow, WalletConnect
- Smart contract wallets (Gnosis Safe, etc.) cannot mint in PUBLIC stage

### During Drop FAQ
- "Transaction failed" -> Insufficient gas or wallet limit reached for current stage
- "I'm on the allowlist but can't mint" -> Check if current stage matches your tier
- "MetaMask won't open" -> Refresh page, clear browser cache
- "Gas fee too high" -> Try again shortly (temporary network congestion)

---

## Anti-Phishing

### Preventive Measures
- Pin official minting URL on all channels (X, Discord, Telegram)
- Repeat: "We never send minting links via DM"
- Set up phishing link detection bot in Discord

### Drop Day
- Remind official URL every 15 minutes on all channels
- Report phishing sites to Google Safe Browsing immediately
- Warn community instantly if fake site detected

---

## Prohibited Actions
1. **Never revert to a previous stage** (FREE_MINT->GTD->FREE_MINT). Signature replay risk.
2. **Never reuse a previous signer key**. All historical signatures become valid again.
3. **Never use the same signer key for testnet and mainnet**. Cross-chain signature replay.
4. **Never update SSM stage before on-chain setStage confirms**.
5. **Never log the signer private key or signature bytes**.
