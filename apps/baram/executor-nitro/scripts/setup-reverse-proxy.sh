#!/bin/bash
# Setup HTTPS reverse proxy for Baram TEE Executor on nasun-node-1
# This script SSHs into nasun-node-1 and configures nginx + SSL.
#
# Prerequisites:
#   - DNS: tee.baram.nasun.io → 3.38.127.23 (add on Porkbun)
#   - SSH key: ~/.ssh/.awskey/nasun-devnet-key.pem
#
# Usage: ./setup-reverse-proxy.sh
set -e

PROXY_HOST="ubuntu@3.38.127.23"
SSH_KEY="$HOME/.ssh/.awskey/nasun-devnet-key.pem"
DOMAIN="tee.baram.nasun.io"

if [ ! -f "$SSH_KEY" ]; then
  echo "Error: SSH key not found at $SSH_KEY"
  exit 1
fi

ssh_cmd() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$PROXY_HOST" "$@"
}

echo "=== Setting up HTTPS reverse proxy for $DOMAIN ==="
echo "Host: $PROXY_HOST"
echo ""

# Step 1: Create nginx server block
echo "--- Step 1: Creating nginx server block ---"
ssh_cmd sudo tee /etc/nginx/sites-available/tee-baram > /dev/null <<'NGINX'
# Baram TEE Executor reverse proxy
# Backend IP is dynamically updated via update-executor.sh

# Upstream backend — IP updated by update-tee-backend.sh
upstream tee_backend {
    server 127.0.0.1:9999; # tee-backend
}

server {
    listen 80;
    server_name tee.baram.nasun.io;

    # Certbot will add HTTPS redirect here
    location / {
        proxy_pass http://tee_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for LLM inference (can take 30-60 seconds)
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_connect_timeout 10s;

        # Security headers (must be inside location block due to nginx add_header inheritance)
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # CORS — restrict to known frontends
        set $cors_origin "";
        if ($http_origin ~* "^https://(baram\.nasun\.io|pado\.finance|staging\.pado\.finance)$") {
            set $cors_origin $http_origin;
        }
        if ($http_origin ~* "^http://localhost:(5177|5176)$") {
            set $cors_origin $http_origin;
        }
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        add_header Vary Origin always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
NGINX

# Step 2: Create the backend update script on nasun-node-1
echo "--- Step 2: Creating backend update script ---"
ssh_cmd sudo tee /usr/local/bin/update-tee-backend.sh > /dev/null <<'SCRIPT'
#!/bin/bash
# Update the TEE backend IP in nginx upstream
# Usage: update-tee-backend.sh <SPOT_IP>
set -e

SPOT_IP=${1:-}
if [ -z "$SPOT_IP" ]; then
  echo "Usage: update-tee-backend.sh <SPOT_IP>"
  exit 1
fi

# Validate IPv4 format to prevent injection
if ! [[ "$SPOT_IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "Error: Invalid IP address: $SPOT_IP"
  exit 1
fi

NGINX_CONF="/etc/nginx/sites-available/tee-baram"

# Replace the upstream server line (marker: # tee-backend)
sed -i "s|server [0-9.:]*; *# tee-backend|server ${SPOT_IP}:3000; # tee-backend|" "$NGINX_CONF"

# Test and reload
nginx -t && systemctl reload nginx
echo "TEE backend updated to $SPOT_IP:3000"
SCRIPT

ssh_cmd sudo chmod +x /usr/local/bin/update-tee-backend.sh

# Step 3: Enable site
echo "--- Step 3: Enabling site ---"
ssh_cmd "sudo ln -sf /etc/nginx/sites-available/tee-baram /etc/nginx/sites-enabled/tee-baram"
ssh_cmd "sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "--- Step 4: Obtaining SSL certificate ---"
echo "Requesting Let's Encrypt certificate for $DOMAIN..."
ssh_cmd "sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@nasun.io"

echo ""
echo "=========================================="
echo "  Reverse Proxy Setup Complete"
echo "=========================================="
echo ""
echo "Domain: https://$DOMAIN"
echo ""
echo "To update the backend IP when a new Spot instance launches:"
echo "  ssh -i $SSH_KEY $PROXY_HOST sudo update-tee-backend.sh <SPOT_IP>"
echo ""
echo "Or use the updated update-executor.sh script which does this automatically."
