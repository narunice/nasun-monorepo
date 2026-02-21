# Handoff: Nasun Devnet EC2 Infrastructure Migration (2-Node -> 3-Node)

**Created**: 2026-02-21 ~14:00
**Branch**: main
**Previous Handoff**: none
**Target Project**: `/home/naru/my_apps/nasun-devnet/` (new Claude session)

## Current Status Summary

A comprehensive 9-phase (Phase 0~8) migration plan has been designed, architect-reviewed, and user-approved to migrate Nasun Devnet from 2 overloaded t3 instances to 3 dedicated m6i instances. The plan is ready for execution. No code changes have been made yet — this is purely planning output that needs to be executed in a nasun-devnet project session.

## Problem Statement

- **node-1** (t3.xlarge): Overloaded. Validator + Fullnode + RPC + Faucet + zkLogin Prover + Nginx all on one box. Fullnode uses CPU 85%, RAM 4.9GB. OOM crash recorded 2/21 00:01. Swap 68%.
- **node-2** (t3.large): CPU load 2.5 on 2 cores (over-saturated). **sui-indexer stuck at checkpoint 4,665,621** (chain at 6,314,292+). Root cause: node-1 Fullnode missing `data-ingestion-dir` config -> REST checkpoint files 404.
- **t3 Burstable instances**: 24/7 high-load workloads (Validator/Fullnode) exhaust CPU credits -> throttling -> swap -> OOM cycle.

## Completed Work

- [x] Infrastructure health check (SSH into both nodes, CPU/RAM/swap/disk analysis)
- [x] Root cause analysis of stuck indexer (missing data-ingestion-dir)
- [x] Architect agent review (12 critical findings including zkLogin Prover URL hardcoding, 2-Validator consensus safety, Faucet RPC dependency, Security Group design, rollback strategies)
- [x] Planner agent output (concrete Phase 0-8 commands with bash, systemd, nginx configs)
- [x] Plan synthesis into unified document (merged architect + planner outputs)
- [x] User approval of final migration plan
- [x] Read all 4 nasun-devnet operational documents for context

## Pending Work

- [ ] **Phase 0**: Infrastructure reconnaissance (VPC/Subnet/SG IDs, disk sizes, configs)
- [ ] **Phase 1**: Create node-3 EC2 instance (m6i.xlarge, 300GB gp3)
- [ ] **Phase 2**: Install & sync Fullnode on node-3 (with data-ingestion-dir)
- [ ] **Phase 3**: PostgreSQL 16 + sui-indexer on node-3 (pg_dump/restore from node-2)
- [ ] **Phase 4**: Deploy Explorer API on node-3 (rsync + PM2)
- [ ] **Phase 4.5**: Stability verification (1+ hours)
- [ ] **Phase 5**: Traffic cutover (DNS + Nginx + Proxy)
- [ ] **Phase 6**: Migrate zkLogin Prover (node-1 -> node-2 Docker)
- [ ] **Phase 7**: Cleanup old services + instance type change (t3 -> m6i, sequential)
- [ ] **Phase 8**: Update documentation (CLAUDE.md, OPERATIONS.md, MEMORY.md)

## Critical Context

### Key Decisions & Rationale

- **pg_dump/restore over re-indexing**: Start checkpoint 4,665,621 can't be re-indexed due to object pruning. Must preserve existing indexed data.
- **m6i over t3**: Dedicated CPU eliminates burstable throttling. Root cause fix, not a band-aid.
- **3-node split**: Validator-only nodes (m6i.large) + dedicated Fullnode+Indexer node (m6i.xlarge). Clean role separation.
- **Cost increase approved**: $213/mo -> $332/mo (+$119, +56%). RI 1-year can reduce to ~$241/mo.

### Critical Issues to Watch

1. **zkLogin Prover URL [CRITICAL]**: `packages/wallet/src/core/zklogin.ts:41` hardcodes `DEFAULT_PROVER_URL = 'https://rpc.devnet.nasun.io/zkprover/v1'`. After DNS change to node-3, **node-3 Nginx must proxy `/zkprover/*` -> node-2**. Otherwise all apps' zkLogin breaks.

2. **2-Validator Consensus [CRITICAL]**: With only 2 validators, losing either stops the network. **Never stop both during migration.** Phase 7 instance type changes must be strictly sequential.

3. **Faucet RPC Dependency [HIGH]**: node-1 Faucet likely uses `localhost:9000` (local Fullnode). After Phase 7 removes Fullnode from node-1, Faucet must point to `rpc.devnet.nasun.io` or node-3 internal IP.

4. **data-ingestion-dir cleanup [MEDIUM]**: Checkpoint files accumulate on disk. Need cron job to auto-delete processed files.

### Existing Stopped node-3

nasun-devnet CLAUDE.md mentions a **stopped node-3** at `52.78.117.96` (i-0385f4fe2c8b7bc81). This was likely from a previous attempt. Investigate during Phase 0 whether to reuse or terminate it.

### File Locations

**Migration Plan (FULL DETAILS)**:
- `/home/naru/.claude/plans/tidy-dazzling-pixel.md` — Complete 9-phase plan with concrete bash commands, rollback strategies, verification checklists

**nasun-devnet Operational Docs** (must be updated post-migration):
- `/home/naru/my_apps/nasun-devnet/CLAUDE.md` — Infrastructure persona, EC2 details, systemd services
- `/home/naru/my_apps/nasun-devnet/doc/NASUN_DEVNET_OPERATIONS.md` — Operations guide (1382 lines)
- `/home/naru/my_apps/nasun-devnet/doc/NASUN_DEVNET_POST_RESET_CHECKLIST.md` — Post-reset deployment checklist
- `/home/naru/my_apps/nasun-devnet/doc/NASUN_DEVNET_RESET_GUIDE.md` — Genesis reset procedure

**nasun-monorepo Docs** (update after migration):
- `/home/naru/my_apps/nasun-monorepo/CLAUDE.md` — "Nasun Indexer Infrastructure" section needs 3-node update
- `/home/naru/.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/MEMORY.md` — Add new infra info

**Key Source Files** (referenced in plan):
- `packages/wallet/src/core/zklogin.ts:41` — zkLogin Prover URL hardcoding
- `apps/network-explorer/api-server/` — Explorer API to deploy on node-3

### Infrastructure Details

| Instance | ID | IP | Current Type | Target Type |
|----------|----|----|-------------|-------------|
| node-1 | i-040cc444762741157 | 3.38.127.23 | t3.xlarge | m6i.large |
| node-2 | i-049571787762752ba | 3.38.76.85 | t3.large | m6i.large |
| node-3 (stopped) | i-0385f4fe2c8b7bc81 | 52.78.117.96 | ? | may reuse/terminate |
| node-3 (NEW) | TBD | TBD | - | m6i.xlarge |
| prod-ec2 | - | 43.200.67.52 | - | no change |

- **AWS Profile**: `nasun-dlt`
- **Region**: `ap-northeast-2` (Seoul)
- **SSH Key**: `~/.ssh/.awskey/nasun-devnet-key.pem` (User: `ubuntu`)
- **Security Group**: `nasun-devnet-sg`

## Recent Changed Files (this session)

```
M packages/wallet-ui/src/connect/wallet-views/AccountTabContent.tsx  (unrelated, pre-existing change)
```

No migration-related code changes were made. All work was planning/research.

## Immediate Next Steps

1. **Open a new Claude session in `/home/naru/my_apps/nasun-devnet/`**
2. **Load this handoff**: Tell Claude to read `/home/naru/my_apps/nasun-monorepo/.claude/handoffs/2026-02-21-devnet-infra-migration.md`
3. **Load the full migration plan**: Read `/home/naru/.claude/plans/tidy-dazzling-pixel.md`
4. **Start Phase 0**: Execute the 10 reconnaissance commands to gather VPC/Subnet/SG IDs, disk sizes, service configs, DNS TTLs
5. **DNS TTL reduction**: Change `rpc.devnet.nasun.io` TTL to 60s in Porkbun (should be done 48h before Phase 5)
