#!/usr/bin/env bash
#
# Inject AGENT_PRIVATE_KEY into prod runtime .env safely.
#
# Reads key from /dev/tty (avoids paste-into-pipe corruption), validates it
# derives the target address, then pipes to ssh stdin to update .env.
# Never logs the key value.
#
# Usage: bash scripts/inject-agent-key.sh
#
set -euo pipefail

TARGET_ADDR="0x97756348fa61c6207e5dc52fc3884a01660e0e81ea3e12a236752d9b5e4577a8"
PROD_SSH_KEY="$HOME/.ssh/.awskey/nasun-prod-key"
EC2="ec2-user@43.200.67.52"
RUNTIME_DIR="/home/ec2-user/nasun-ai-runtime"
RUNTIME_NODE_MODULES="/home/naru/my_apps/nasun-monorepo/apps/nasun-ai-runtime/node_modules"

printf "Paste AGENT_PRIVATE_KEY (suiprivkey1.../hex/base64), then Enter:\n> "
# Read without echo, from terminal (not stdin pipe).
IFS= read -rs NEW_KEY < /dev/tty
echo
NEW_KEY="${NEW_KEY//[$'\t\r\n ']}"

if [ -z "$NEW_KEY" ]; then
  echo "FAIL: empty key — paste was lost. Retry." >&2
  exit 1
fi

echo "len=${#NEW_KEY}, first 6 chars: ${NEW_KEY:0:6}…"

# Validate locally that the key derives the target address.
DERIVED=$(NEW_KEY="$NEW_KEY" node -e "
const { Ed25519Keypair } = require('${RUNTIME_NODE_MODULES}/@mysten/sui/keypairs/ed25519');
const raw = process.env.NEW_KEY;
let kp;
if (raw.startsWith('suiprivkey1')) kp = Ed25519Keypair.fromSecretKey(raw);
else if (/^(0x)?[0-9a-fA-F]{64}\$/.test(raw)) kp = Ed25519Keypair.fromSecretKey(Buffer.from(raw.replace(/^0x/, ''), 'hex'));
else kp = Ed25519Keypair.fromSecretKey(Buffer.from(raw, 'base64'));
process.stdout.write(kp.toSuiAddress());
") || { echo "FAIL: key format invalid"; exit 1; }

echo "derived: $DERIVED"
echo "target : $TARGET_ADDR"
if [ "$DERIVED" != "$TARGET_ADDR" ]; then
  echo "FAIL: key derives wrong address — aborting." >&2
  exit 1
fi
echo "OK: address matches."

# Pipe key to ssh stdin, never as arg / env var.
printf '%s' "$NEW_KEY" | ssh -i "$PROD_SSH_KEY" "$EC2" "
set -e
KEY=\$(cat | tr -d '\n\r ')
if [ \${#KEY} -lt 32 ]; then echo 'FAIL: key arrived too short'; exit 1; fi
cd $RUNTIME_DIR
cp .env .env.bak.\$(date +%s)
sed -i \"s|^AGENT_PRIVATE_KEY=.*|AGENT_PRIVATE_KEY=\${KEY}|\" .env
sed -i 's|^WALLET_ADDRESS=.*|WALLET_ADDRESS=0x683aaf5da378a8beb292cbb8d8a6f63100e87cafb4f850975aa7efdf416d7d88|' .env
sed -i 's|^CAPABILITY_ID=.*|CAPABILITY_ID=0x6ad43a18b82a7cd326506c52687afcdd3cef7ebaa2322249ccc6e3ff7a24d8b3|' .env
sed -i 's|^BUDGET_ID=.*|BUDGET_ID=0xa47fb53ef044bf8d98c7bcca4d44257949c91b84c11f898f6d3b91a7c07d4f62|' .env
sed -i 's|^ESCROW_ID=.*|ESCROW_ID=0x41a7091f3011c6e313d5115fc4d7e0c9d62a44b895d74a9a734b4591700f84d4|' .env
echo '=== .env post-update (no secrets) ==='
for k in WALLET_ADDRESS CAPABILITY_ID BUDGET_ID ESCROW_ID EXECUTOR_ADDRESS HOST_URL; do grep \"^\$k=\" .env; done
echo -n 'AGENT_PRIVATE_KEY len in env: '
grep '^AGENT_PRIVATE_KEY=' .env | cut -d= -f2 | wc -c
echo '=== pm2 restart ==='
pm2 restart nasun-ai-runtime
sleep 6
pm2 logs nasun-ai-runtime --lines 30 --nostream 2>&1 | grep -E 'Agent:|cycle|AER landed|preflight|fatal' | tail -15
"

unset NEW_KEY
echo "Done. If logs show 'Agent: 0x97756348...' the swap was clean."
