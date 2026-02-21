# Handoff: Nasun Devnet 3-Node m6i Migration — Completed

**Created**: 2026-02-21
**Status**: COMPLETED (Phase 0~8 all done)
**Previous Handoff**: `2026-02-21-devnet-infra-migration.md` (planning phase)
**Executed in**: `/home/naru/my_apps/nasun-devnet/` (Claude session)

---

## Summary

Nasun Devnet 인프라를 2-node t3 Burstable에서 3-node m6i Dedicated로 마이그레이션 완료.
모든 서비스 정상 운영 확인. 다운타임 최소화 (Validator 순차 재시작 각 5~10분).

## Before / After

```
BEFORE (2-node t3, overloaded):
  node-1 (t3.xlarge 16GB): Validator + Fullnode + Faucet + Prover + Nginx  → OOM crash
  node-2 (t3.large 8GB):   Validator + Indexer + PostgreSQL + Explorer     → CPU 2.5 (saturated)

AFTER (3-node m6i, role-separated):
  node-1 (m6i.large 8GB):   Validator + Faucet + Nginx
  node-2 (m6i.large 8GB):   Validator + zkLogin Prover (Docker)
  node-3 (m6i.xlarge 16GB): Fullnode + sui-indexer + PostgreSQL + Explorer API + Nginx
```

## Infrastructure Details

| Node | IP | Instance ID | Type | EBS | Role |
|------|-----|------------|------|-----|------|
| node-1 | 3.38.127.23 | i-040cc444762741157 | m6i.large (8GB) | 200GB gp3 | Validator + Faucet + Nginx |
| node-2 | 3.38.76.85 | i-049571787762752ba | m6i.large (8GB) | 200GB gp3 | Validator + zkLogin Prover |
| node-3 | 54.180.61.196 | i-0c3b43a7d96de2f09 | m6i.xlarge (16GB) | 300GB gp3 | Fullnode + Indexer + PostgreSQL + Explorer + Nginx |

**VPC Internals**: node-1 `172.31.29.38`, node-2 `172.31.22.235`, node-3 `172.31.25.242`
**Security Group**: sg-03fbfb49200cce461 (nasun-devnet-sg)
**EBS Snapshots** (pre-migration backup): snap-0dac1e511675218e5 (node-1), snap-0ee12ea6ca2c412f1 (node-2)

## DNS / Endpoint Changes

| Endpoint | Before | After |
|----------|--------|-------|
| `rpc.devnet.nasun.io` | 3.38.127.23 (node-1) | **54.180.61.196 (node-3)** |
| `faucet.devnet.nasun.io` | 3.38.127.23 (node-1) | 3.38.127.23 (node-1, unchanged) |
| RPC HTTP | http://3.38.127.23:9000 | **http://54.180.61.196:9000** |
| Explorer API upstream (prod-ec2) | node-2:3200 | **node-3:3200** |

## Critical Routing: zkLogin Prover

**No frontend/wallet code changes needed.** All apps use `https://rpc.devnet.nasun.io/zkprover/v1` which is domain-based.

Routing chain:
```
Client → rpc.devnet.nasun.io/zkprover/* → node-3 Nginx → node-2 VPC (172.31.22.235:8081) → Docker prover
```

- node-3 nginx: `/zkprover/` location proxies to node-2 VPC IP
- SG rule: port 8081 from 172.31.25.242/32 (node-3 only)
- Rate limit: 5 req/min per IP, burst=3

## Faucet RPC Dependency

Faucet on node-1 previously used `localhost:9000` (local Fullnode). After Fullnode moved to node-3:

- `client.yaml` rpc field changed to `http://172.31.25.242:9000` (node-3 VPC)
- `nasun-faucet.service` `After=` dependency on `nasun-fullnode.service` removed
- SG already allows port 9000 within VPC

## Phase Execution Summary

| Phase | Description | Key Actions | Duration |
|-------|-------------|-------------|----------|
| 0 | Recon + DNS TTL | VPC/SG/config collection, Porkbun TTL 600s | ~30min |
| 1 | Create node-3 | m6i.xlarge, 300GB gp3, EIP, packages, swap 4GB | ~20min |
| 2 | Fullnode sync | VPC rsync (55GB, 12min), fullnode.yaml config | ~30min |
| 3 | PostgreSQL + Indexer | pg_dump/restore, sui-indexer systemd, data-ingestion | ~40min |
| 4 | Explorer API | rsync + npm install + PM2 | ~15min |
| 4.5 | Stability check | All services verified stable | ~10min |
| 5 | Traffic cutover | Nginx config, DNS change, SSL cert, prod-ec2 upstream | ~30min |
| 6 | Prover migration | Docker install on node-2, image transfer (588MB), nginx switch | ~30min |
| 7 | Cleanup + type change | Service removal, instance type changes (sequential), final verify | ~40min |
| 8 | Documentation | CLAUDE.md, OPERATIONS.md, MEMORY.md updated | ~30min |

## Key Technical Decisions & Fixes

### VPC rsync for Fullnode DB
- genesis sync would take ~2.5 days. VPC rsync completed in 12 minutes (75MB/s internal).
- Temporary SSH key generated, SG rule added/removed for VPC SSH.

### Fullnode db-path mismatch
- After rsync, node-3 showed checkpoint 650 instead of 6.5M.
- Root cause: node-1 actual db-path was nested (`/home/ubuntu/full_node_db/full_node_db/86e8774b6dad`).
- Fix: updated node-3 fullnode.yaml db-path to match.

### data-ingestion-dir YAML placement
- Initially placed at YAML top level — files not generated.
- SUI source requires it under `checkpoint-executor-config:` section.
- Fix: moved to correct YAML location, files started generating immediately.

### sui-indexer CLI argument ordering
- `--metrics-address` is a **global flag** (before `indexer` subcommand).
- `--data-ingestion-path` is a **subcommand flag** (after `indexer`).
- Metrics port 9185 (Fullnode uses 9184).

### sui-indexer checkpoint gap
- DB watermark at 4,687,174 but data-ingestion files start at 6,533,077 (~1.8M gap).
- Fix: `--start-checkpoint 6533077` to skip gap. Old indexed data preserved.
- `--gc-checkpoint-files` defaults to true (auto-deletes processed files).

## Services on Each Node

### Node 1 (3.38.127.23)
| Service | Status | Notes |
|---------|--------|-------|
| `nasun-validator` | active | Validator consensus |
| `nasun-faucet` | active | RPC → node-3 VPC (172.31.25.242:9000) |
| `nginx` | active | faucet.devnet.nasun.io HTTPS |
| `nasun-fullnode` | **disabled** | Moved to node-3 |
| cron: checkpoint-monitor | active | Validator watchdog |
| cron: disk-monitor | active | 3-tier alerts |
| cron: fullnode-restart | **disabled** | No longer needed |
| cron: fullnode-resync-trigger | **disabled** | No longer needed |

### Node 2 (3.38.76.85)
| Service | Status | Notes |
|---------|--------|-------|
| `nasun-validator` | active | Validator consensus |
| Docker: zkprover | active | ~/zkprover/docker-compose.yml, port 0.0.0.0:8081:8080 |
| `sui-indexer` | **removed** | Moved to node-3 |
| `postgresql` | **removed** | Moved to node-3 |
| PM2: explorer-api | **removed** | Moved to node-3 |

### Node 3 (54.180.61.196)
| Service | Status | Notes |
|---------|--------|-------|
| `nasun-fullnode` | active | RPC :9000, data-ingestion-dir enabled |
| `sui-indexer` | active | Local file ingestion, metrics :9185 |
| `postgresql` | active | shared_buffers=4GB, effective_cache_size=12GB |
| PM2: explorer-api | active | :3200, DATABASE_URL → localhost |
| `nginx` | active | rpc.devnet.nasun.io + /zkprover/* proxy |

## Security Group Rules Added

| Rule ID | Port | Source | Purpose |
|---------|------|--------|---------|
| sgr-06f8a35ecc01a5ac2 | 8081 | 172.31.25.242/32 | node-3 → node-2 zkprover |
| (existing) | 3200 | 43.200.67.52/32 | prod-ec2 → node-3 explorer API |

## prod-ec2 Changes

- **Explorer API upstream**: `/etc/nginx/conf.d/explorer.conf` changed from `node-2:3200` to `node-3:3200`
- SSH: `ssh -i ~/.ssh/nasun-prod-key.pem ec2-user@43.200.67.52`
- AWS profile: `nasun-prod`

## nasun-monorepo Impact

### No Code Changes Required
- **zkLogin Prover URL**: Apps use domain-based URL (`rpc.devnet.nasun.io/zkprover/v1`), no code changes needed.
- **RPC URL**: Apps use `https://rpc.devnet.nasun.io` (domain), no code changes needed.
- **Explorer API**: prod-ec2 nginx upstream updated, no app code changes needed.
- **devnet-config package**: `network.rpcUrl` in `devnet-ids.json` may still reference `http://3.38.127.23:9000` — update to `http://54.180.61.196:9000` if used for direct HTTP access.

### Documentation Updates Needed
- [ ] `CLAUDE.md` "Nasun Indexer Infrastructure" section — update to 3-node architecture
- [ ] `MEMORY.md` — update devnet infra references

### devnet-ids.json
If `packages/devnet-config/devnet-ids.json` contains:
```json
"network": {
  "rpcUrl": "http://3.38.127.23:9000",
  ...
}
```
Update to:
```json
"network": {
  "rpcUrl": "http://54.180.61.196:9000",
  ...
}
```
Note: Most apps use `https://rpc.devnet.nasun.io` which already resolves to node-3. Only direct HTTP references need updating.

## Cost

| Item | Before | After |
|------|--------|-------|
| node-1 | t3.xlarge $0.2432/h | m6i.large $0.1224/h |
| node-2 | t3.large $0.1216/h | m6i.large $0.1224/h |
| node-3 | - | m6i.xlarge $0.2448/h |
| **Monthly** | **~$213** | **~$332** |
| Monthly (1yr RI) | - | **~$241** |

## Key File References

| File | Location | Description |
|------|----------|-------------|
| CLAUDE.md | `/home/naru/my_apps/nasun-devnet/CLAUDE.md` | Updated for 3-node |
| OPERATIONS.md | `/home/naru/my_apps/nasun-devnet/doc/NASUN_DEVNET_OPERATIONS.md` | v7.0.0, 3-node |
| MEMORY.md | `~/.claude/projects/-home-naru-my-apps-nasun-devnet/memory/MEMORY.md` | Updated |
| Migration plan | `/home/naru/.claude/plans/sorted-swimming-moon.md` | Original execution plan |
| Fullnode config | `ubuntu@54.180.61.196:/home/ubuntu/nasun-node/fullnode.yaml` | Node-3 fullnode |
| sui-indexer service | `ubuntu@54.180.61.196:/etc/systemd/system/sui-indexer.service` | Node-3 indexer |
| nginx (node-3) | `ubuntu@54.180.61.196:/etc/nginx/sites-available/nasun-devnet` | RPC + zkprover |
| nginx (node-1) | `ubuntu@3.38.127.23:/etc/nginx/sites-available/nasun-devnet` | Faucet HTTPS |
| docker-compose | `ubuntu@3.38.76.85:~/zkprover/docker-compose.yml` | zkLogin Prover |
| explorer.conf | `ec2-user@43.200.67.52:/etc/nginx/conf.d/explorer.conf` | API upstream |
