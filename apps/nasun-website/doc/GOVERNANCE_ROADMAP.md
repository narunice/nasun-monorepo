# Nasun Community Governance Roadmap

## Overview

This document outlines the implementation status and future roadmap for Nasun Community Governance (`/protocol/governance`).

---

## Voting Power System

### Sources of Voting Power

| Source | Description | Weight | Status |
|--------|-------------|--------|--------|
| **Leaderboard Score** | X/Twitter engagement points | Base (1x) | ✅ Implemented |
| **Ethereum NFT** | Nasun Membership NFT ownership | +100 Bonus | ✅ Implemented |
| **NASUN Token** | NASUN token balance on Sui | TBD | ⏳ Post-TGE |

### Voting Power Calculation

```
Total Voting Power =
  (Leaderboard Score × 1) +
  (NFT Bonus: 100 if owned) +
  (NASUN Balance × TOKEN_WEIGHT)  // Post-TGE
```

---

## Implementation Status

### ✅ Phase 1: Leaderboard-based Voting Power (Completed)

**Smart Contract**: `contracts/governance/sources/proposal.move`
- Changed from 1-person-1-vote to weighted voting power
- Added `total_power_yes`, `total_power_no` fields
- Vote function accepts `voting_power` parameter

**Backend API**: `cdk/lambda-src/governance-api/`
- `GET /api/governance/voting-power` - Calculates voting power from leaderboard
- `GET /api/governance/config` - Returns governance configuration

**Frontend**: `frontend/src/features/governance/`
- `useVotingPower` hook for fetching voting power
- VoteModal displays voting power breakdown

### ✅ Phase 2: Ethereum NFT Verification (Completed)

**Dual Signature Flow**:
1. **MetaMask Signature** - Verify NFT ownership on Ethereum (read-only)
2. **Nasun Wallet Signature** - Execute vote transaction on Sui

**Backend API**: `cdk/lambda-src/governance-api/`
- `POST /api/governance/verify-nft` - Verifies NFT ownership via signature

**Frontend**:
- MetaMask integration in VoteModal
- "Add NFT Voting Power" option
- NFT Verified badge display

**Security**:
- Replay attack prevention with proposalId + timestamp in message
- Address recovery from signature (no DB storage needed)
- Real-time NFT ownership verification via Alchemy API

### ⏳ Phase 3: NASUN Token Voting Power (Post-TGE)

To be implemented after Token Generation Event:
```typescript
async function getNasunBalance(address: string): Promise<number> {
  const balance = await suiClient.getBalance({
    owner: address,
    coinType: NASUN_COIN_TYPE,
  });
  return Number(balance.totalBalance);
}
```

### ✅ Phase 4: Delegation System (Completed)

**Smart Contract**: `contracts/governance/sources/delegation.move`
- `DelegationRegistry` shared object tracks all delegations
- `delegations` Table: delegator → delegate mapping
- `delegators_of` Table: delegate → list of delegators
- Functions: `delegate()`, `revoke()`, view functions

**Frontend**: `frontend/src/features/governance/`
- `useDelegation` hook for delegation operations
- `DelegationPanel.tsx` component with:
  - Current delegation status display
  - Delegate voting power to another address
  - Revoke delegation
  - View incoming delegations count
  - Info box explaining delegation mechanics

**Security**:
- Self-delegation prevention
- Circular delegation detection
- Revoke required before re-delegating

---

## Future Features (Not Yet Planned)

These features are documented for future consideration but not currently scheduled.

### 1. Multi-choice Voting

**Current**: Binary voting (Yes/No)
**Future**: Support for 3+ choices

**Use Cases**:
- Parameter selection (e.g., "Set fee to 0.1% / 0.5% / 1%")
- Election-style voting with multiple candidates

**Technical Considerations**:
- Smart contract needs dynamic choice array
- UI needs to support N buttons instead of 2
- Vote counting becomes more complex

### 2. Community Proposals

**Current**: Only admin can create proposals
**Future**: Community members with sufficient voting power can propose

**Requirements**:
- Minimum voting power threshold to propose
- Proposal deposit (refunded if passed, slashed if spam)
- Review period before voting starts

**Technical Considerations**:
- Anti-spam mechanisms needed
- Moderation tools for inappropriate content
- Proposal categories/tags

### 3. Quadratic Voting

**Current**: Linear voting (1 Power = 1 Vote weight)
**Future**: Quadratic voting (N Votes costs N² Power)

**Benefits**:
- Prevents whale dominance
- Encourages broader participation
- Better represents intensity of preferences

**Formula**:
```
Cost = (Number of Votes)²
Example: 5 votes costs 25 voting power
```

**Technical Considerations**:
- More complex smart contract logic
- UX needs to clearly explain the cost curve
- May need voting power "budget" concept

### 4. Time-weighted Voting

**Concept**: Voting power increases based on how long tokens are held/staked

**Benefits**:
- Rewards long-term commitment
- Discourages vote buying just before proposals

**Technical Considerations**:
- Requires on-chain tracking of holding duration
- Snapshot mechanisms for fair calculation

### 5. Conviction Voting

**Concept**: Voting power accumulates over time while vote is held

**Benefits**:
- Rewards conviction in decisions
- Allows minority preferences to eventually pass

**Technical Considerations**:
- Complex state management
- Continuous voting power updates

---

## File Structure

```
apps/nasun-website/
├── contracts/governance/
│   └── sources/
│       ├── proposal.move       # Main proposal contract ✅
│       └── delegation.move     # Delegation contract ✅
├── cdk/lambda-src/
│   └── governance-api/         # Voting power & NFT verification ✅
├── frontend/src/features/governance/
│   ├── components/
│   │   ├── VoteModal.tsx       # Voting UI ✅
│   │   └── DelegationPanel.tsx # Delegation UI ✅
│   ├── hooks/
│   │   ├── useVotingPower.ts   # Voting power hook ✅
│   │   └── useDelegation.ts    # Delegation hook ✅
│   └── types/
│       └── voting.ts           # Type definitions
└── doc/
    └── GOVERNANCE_ROADMAP.md   # This file
```

---

## Environment Variables

```env
# Backend (Lambda)
ALCHEMY_API_KEY=xxx
NASUN_NFT_CONTRACT_ADDRESS=0x...
LEADERBOARD_TABLE_NAME=nasun-website-leaderboard-prod
NFT_BONUS=100
TOKEN_WEIGHT=0  # Enable post-TGE

# Frontend
VITE_GOVERNANCE_API_URL=/api/governance
```

---

## Changelog

### 2025-12-28
- ✅ Phase 1: Leaderboard-based voting power implemented
- ✅ Phase 2: Ethereum NFT verification via MetaMask signature
- ✅ Phase 4: Delegation system implemented (delegation.move, DelegationPanel.tsx)
- 📝 Future features documented (Multi-choice, Community Proposals, Quadratic)
