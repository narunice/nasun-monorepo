# NasunGenesisPass Smart Contract - Security Review Request

**Date**: 2026-04-06
**Version**: 1.0 (pre-mainnet)
**Compiler**: Solidity 0.8.27, EVM Cancun, optimizer 200 runs
**Contract**: `NasunGenesisPass.sol` (291 lines)
**Dependencies**: OpenZeppelin Contracts v5.x
**Testnet deployment**: Sepolia `0x3b89DA1241Ea70D5c2c105601bF77A93bD7e7Aae`
**Repository path**: `apps/nasun-website/contracts/genesis-pass/`

---

## 1. Contract Overview

ERC-1155 NFT drop contract with 4-stage minting (Free Mint, GTD Allowlist, FCFS Allowlist, Public), EIP-712 signature-based allowlist gating, per-stage dynamic pricing, transfer lock, and time-based mint deadline.

### Inheritance

```
NasunGenesisPass
  ├── ERC1155           (token standard)
  ├── EIP712            (typed structured data signing)
  ├── Ownable2Step      (2-step ownership transfer)
  ├── ReentrancyGuard   (reentrancy protection)
  └── ERC2981           (royalty standard)
```

### Token Model

- ERC-1155 with 7 token types (tokenId 1-7)
- Each token type has independent `maxSupply` and `totalMinted` tracking
- Default `maxSupply` set at deployment, adjustable per token via `setMaxSupply`

---

## 2. Stage System

```
PAUSED(0) -> FREE_MINT(1) -> GTD_ALLOWLIST(2) -> FCFS_ALLOWLIST(3) -> PUBLIC(4)
```

### Stage Transition Rules

- **Forward-only progression** enforced via `highWaterMark`
- `PAUSED` (0) is always allowed as an emergency brake
- `highWaterMark` prevents backward regression through PAUSED (e.g., stage 3 -> PAUSED -> stage 1 is blocked)
- Paid stages (GTD, FCFS, PUBLIC) require `mintPricePerStage > 0` before activation; otherwise `StageNotPriced` revert

### Minting Rules by Stage

| Stage | Signature Required | Payment | Bot Guard |
|---|---|---|---|
| PAUSED | N/A (reverts) | N/A | N/A |
| FREE_MINT | Yes (EIP-712) | Must be 0 | No |
| GTD_ALLOWLIST | Yes (EIP-712) | Exact `price * quantity` | No |
| FCFS_ALLOWLIST | Yes (EIP-712) | Exact `price * quantity` | No |
| PUBLIC | No | Exact `price * quantity` | `msg.sender == tx.origin` |

---

## 3. Key Mechanisms

### 3.1 EIP-712 Signature Gating (Stages 1-3)

```solidity
bytes32 public constant MINT_TYPEHASH = keccak256(
    "Mint(address minter,uint8 stage,uint256 maxQuantity,uint256 deadline)"
);
```

- Lambda backend signs `(minter, stage, maxQuantity, deadline)` tuples
- `stage` is encoded into the signature, preventing cross-stage replay
- `deadline` provides time-bounded validity
- `maxQuantity` caps total mints per wallet per stage (independent of `walletLimitPerStage`)

**Signer key**: Stored in AWS Secrets Manager, accessed by Lambda. Signer address set via `setSigner()`.

### 3.2 Per-Stage Pricing

- `mintPricePerStage` mapping stores price per stage
- `setStagePrice()` rejects price=0 for paid stages and price changes to FREE_MINT/PAUSED
- `currentMintPrice()` view function returns active stage price
- Payment validation: exact match (`msg.value != price * quantity`) with no refund mechanism
- Defense-in-depth: `mint()` independently checks `price != 0` even though `setStage()` already guards this

### 3.3 Transfer Lock

- `transfersUnlocked` defaults to `false`
- `_update()` override blocks all transfers where `from != address(0)` (minting always allowed)
- `unlockTransfers()` is one-way (no re-lock function)
- `setApprovalForAll` works while locked, but actual transfers are blocked

### 3.4 Wallet Limits

- `walletLimitPerStage` mapping, per-stage independent tracking
- Default 0 = all mints revert (critical operational risk if not set before stage activation)
- `mintedPerStage` tracks per-address per-stage mint count
- Both `walletLimitPerStage` and signature's `maxQuantity` are enforced (dual cap)

### 3.5 Withdrawal

- `withdrawTo(address payable to)`: sends full contract balance via `Address.sendValue`
- Protected by `onlyOwner` + `nonReentrant`
- Reverts on zero address and if recipient rejects ETH

---

## 4. Access Control

- **Ownable2Step**: 2-phase ownership transfer (propose + accept)
- **renounceOwnership disabled**: overridden to always revert
- **All admin functions** gated by `onlyOwner`:
  - `setStage`, `setSigner`, `setStagePrice`, `setMaxSupply`
  - `setWalletLimit`, `setURI`, `setContractURI`, `setMintDeadline`
  - `withdrawTo`, `unlockTransfers`

---

## 5. Areas of Concern (Review Focus)

### 5.1 HIGH: Signature Security

- Is the EIP-712 domain separator correctly binding to chain and contract address?
- Can signatures be replayed across chains if the contract is deployed on multiple networks?
- Is the `maxQuantity` parameter in signatures properly enforced against the on-chain `walletLimitPerStage`?
- What happens if `signer` is rotated mid-stage? (Intended: old signatures become invalid immediately)

### 5.2 HIGH: Payment Handling

- Exact payment matching (`msg.value != price * quantity`) with no refund -- is this safe against edge cases?
- Can `price * quantity` overflow? (Solidity 0.8.x has built-in overflow checks, but worth verifying)
- What if owner sets price to `type(uint256).max / 2`? Could arithmetic overflow bypass payment?

### 5.3 HIGH: Stage Transition Integrity

- `highWaterMark` prevents backward regression, but can the same stage be re-entered after PAUSED?
  (Answer: No. `uint8(stage_) <= highWaterMark` blocks equal values)
- Are there any race conditions between `setStage` and in-flight `mint` transactions?
- Tokens minted in a previous stage instance (before PAUSED) still count toward `mintedPerStage` -- is this correct behavior?

### 5.4 MEDIUM: Transfer Lock

- `_update` override checks `from != address(0)` -- does this correctly distinguish minting from transfers?
- Is `safeBatchTransferFrom` also blocked? (Yes, it goes through `_update`)
- After `unlockTransfers()`, can the owner accidentally call it again? (Idempotent, no harm)

### 5.5 MEDIUM: Bot Protection

- `msg.sender != tx.origin` in PUBLIC stage blocks contract callers, but does NOT protect against EOA bots
- No bot protection in allowlist stages (EIP-712 signature is the gatekeeper)
- Is there a concern about Flashbots/MEV for free or underpriced mints?

### 5.6 LOW: Operational Risks

- `walletLimitPerStage` default is 0 -- if not set before stage activation, all mints fail
- `mintDeadline = 0` means no deadline (disabled), not "already expired"
- `maxSupply` can be increased at any time by owner -- is this intentional for "no fixed cap" model?

---

## 6. Test Coverage Summary

4 test files, covering:

| Category | Tests | Status |
|---|---|---|
| Deployment & initial state | 4 | Pass |
| FREE_MINT minting | 2 | Pass |
| GTD/FCFS allowlist minting | 3 | Pass |
| PUBLIC minting | 1 | Pass |
| Signature validation (invalid signer, expired, cross-stage, wrong minter) | 4 | Pass |
| Admin functions (stage, price, URI, maxSupply) | 7 | Pass |
| Withdrawal (normal, zero addr, ETH rejecter, full balance) | 4 | Pass |
| PAUSED enforcement | 2 | Pass |
| Ownable2Step + renounce disabled | 2 | Pass |
| Royalty (ERC-2981) | 1 | Pass |
| Reentrancy + bot protection | 2 | Pass |
| Signature edge cases (empty, random bytes, wrong domain, deadline=0) | 4 | Pass |
| Payment security (over/under/zero payment, direct ETH) | 4 | Pass |
| Supply integrity (boundary) | 1 | Pass |
| Access control (pending owner, all admin fns) | 2 | Pass |
| Full lifecycle E2E (4 stages + withdraw + transfer) | 2 | Pass |
| Stage transition + backward guard + PAUSED bypass | 4 | Pass |
| Mint deadline (before, after, extend, admin unaffected) | 5 | Pass |
| HighWaterMark tracking | 4 | Pass |
| Transfer lock (single, batch, approval, one-way, mint-while-locked) | 8 | Pass |
| Per-stage pricing (different prices, no-price revert, currentMintPrice) | 6 | Pass |
| Emergency withdrawal while paused | 1 | Pass |
| Edge cases (quantity=0, signer rotation, cross-stage limits, walletLimit=0) | 8 | Pass |

### Test Contracts

- `ReentrancyAttacker.sol`: attempts reentrant mint via `onERC1155Received` callback
- `ETHRejecter.sol`: contract that reverts on ETH receive (tests withdrawal failure path)

---

## 7. Known Design Decisions (Not Bugs)

1. **No refund mechanism**: Exact payment required, overpayment reverts. Simplifies accounting.
2. **No pause on mint (only stage)**: `Pausable` not used. `setStage(PAUSED)` serves the same purpose.
3. **No nonce in signature**: Stage + deadline + wallet limit provide sufficient replay protection without per-nonce tracking.
4. **7 token types**: Fixed at compile time (`NUM_TOKEN_TYPES = 7`). Not upgradeable.
5. **`tx.origin` check**: Only in PUBLIC stage. Accepted trade-off for bot deterrence given account abstraction limitations.
6. **One-way transfer lock**: Cannot re-lock after unlock. Intentional for post-mint secondary market enablement.
7. **No `receive()` or `fallback()`**: Contract cannot accept bare ETH transfers (only via `mint` payable function).

---

## 8. Deployment Configuration (Mainnet Target)

```
Base URI:           ipfs://[TBD]
Contract URI:       ipfs://[TBD]
Signer:             [Dedicated mainnet signer from Secrets Manager]
Default Max Supply: 20000 (per token type)
Royalty:            5% (500 bps) to treasury
Stage Prices:       GTD ~$8, FCFS ~$10, PUBLIC ~$15 (in ETH wei)
Wallet Limits:      1 per wallet per stage
Mint Deadline:      2026-04-14T15:00Z (Unix: 1776171600)
```

---

## 9. Out of Scope

- Frontend/UI code
- Lambda backend (mint-signature generation)
- CDK infrastructure (API Gateway, DynamoDB)
- Metadata content (IPFS)
- Gas optimization (not a priority for this review)

---

## 10. Requested Deliverables

1. Line-by-line review of `NasunGenesisPass.sol`
2. Verification of all custom error paths
3. Assessment of Section 5 (Areas of Concern) with severity ratings
4. Identification of any additional vulnerabilities not listed above
5. Confirmation that OpenZeppelin integrations are correctly used
6. Operational checklist validation (Section 6 of handoff document)
