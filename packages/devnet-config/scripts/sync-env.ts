#!/usr/bin/env tsx
/**
 * Sync devnet-ids.json to all app .env files
 *
 * Usage: pnpm devnet:sync
 *
 * This script reads devnet-ids.json and generates .env files for each app
 * with the correct Vite environment variable mappings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

// Load devnet config
const configPath = path.join(__dirname, '../devnet-ids.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Env variable mappings for each app
const ENV_MAPPINGS: Record<string, Record<string, () => string>> = {
  'apps/pado': {
    VITE_RPC_URL: () => config.network.rpcUrl,
    VITE_FAUCET_URL: () => config.network.faucetUrl,
    VITE_CHAIN_ID: () => config.network.chainId,

    // Tokens
    VITE_TOKENS_PACKAGE: () => config.tokens.packageId,
    VITE_TOKEN_FAUCET: () => config.tokens.tokenFaucet,
    VITE_CLAIM_RECORD: () => config.tokens.claimRecord,
    VITE_NBTC_TYPE: () => `${config.tokens.packageId}::nbtc::NBTC`,
    VITE_NUSDC_TYPE: () => `${config.tokens.packageId}::nusdc::NUSDC`,
    VITE_FAUCET_PACKAGE: () => config.tokens.packageId,

    // DeepBook
    VITE_DEEPBOOK_PACKAGE: () => config.deepbook.packageId,
    VITE_DEEPBOOK_REGISTRY: () => config.deepbook.registry,
    VITE_DEEPBOOK_ADMIN_CAP: () => config.deepbook.adminCap,
    VITE_DEEP_TOKEN: () => config.deepbook.tokenPackageId,

    // Prediction
    VITE_PREDICTION_PACKAGE: () => config.prediction.packageId,
    VITE_PREDICTION_GLOBAL_STATE: () => config.prediction.globalState,
    VITE_PREDICTION_ADMIN_CAP: () => config.prediction.adminCap,
    VITE_PREDICTION_RESOLVER_ADDRESS: () => config.admin,

    // Lottery
    VITE_LOTTERY_PACKAGE: () => config.lottery.packageId,
    VITE_LOTTERY_REGISTRY: () => config.lottery.registry,
    VITE_LOTTERY_ADMIN_CAP: () => config.lottery.adminCap,

    // Tokens V2 (coin types use original package IDs, moveCall targets use upgraded)
    VITE_TOKENS_V2_PACKAGE: () => config.tokensV2?.packageId || '',
    VITE_NETH_TYPE: () => { const pkg = config.tokensV2?.nethOriginalPackageId || config.tokensV2?.nethPackageId; return pkg ? `${pkg}::neth::NETH` : ''; },
    VITE_NSOL_TYPE: () => { const pkg = config.tokensV2?.originalPackageId || config.tokensV2?.packageId; return pkg ? `${pkg}::nsol::NSOL` : ''; },
    VITE_TOKEN_FAUCET_V2: () => config.tokensV2?.tokenFaucetV2 || '',
    VITE_CLAIM_RECORD_V2: () => config.tokensV2?.claimRecordV2 || '',
    VITE_NETH_FAUCET_V2: () => config.tokensV2?.nethFaucetV2 || '',
    VITE_NETH_CLAIM_RECORD_V2: () => config.tokensV2?.nethClaimRecordV2 || '',

    // Pools (may be empty)
    VITE_POOL_NBTC_NUSDC: () => config.pools?.nbtcNusdc || '',
    VITE_POOL_NASUN_NUSDC: () => config.pools?.nsnNusdc || '',
    VITE_POOL_NETH_NUSDC: () => config.pools?.nethNusdc || '',
    VITE_POOL_NSOL_NUSDC: () => config.pools?.nsolNusdc || '',

    // Oracle
    VITE_ORACLE_PACKAGE_ID: () => config.oracle?.packageId || '',
    VITE_ORACLE_REGISTRY_ID: () => config.oracle?.registry || '',
    VITE_ORACLE_ADMIN_CAP_ID: () => config.oracle?.adminCap || '',

    // Lending
    VITE_LENDING_PACKAGE_ID: () => config.lending?.packageId || '',
    VITE_LENDING_POOL_ID: () => config.lending?.pool || '',

    // Unified Margin
    VITE_MARGIN_PACKAGE_ID: () => config.margin?.packageId || '',
    VITE_MARGIN_REGISTRY_ID: () => config.margin?.registry || '',

    // Perpetuals
    VITE_PERP_PACKAGE_ID: () => config.perp?.packageId || '',
    VITE_PERP_MARKET_BTC: () => config.perp?.btcMarket || '',

    // Smart Account (NSA)
    VITE_NSA_PACKAGE_ID: () => config.nsa?.packageId || '',
  },

  'apps/nasun-website': {
    VITE_RPC_URL: () => config.network.rpcUrl,
    VITE_CHAIN_ID: () => config.network.chainId,

    // Governance
    VITE_GOVERNANCE_PACKAGE: () => config.governance.packageId,
    VITE_GOVERNANCE_DASHBOARD: () => config.governance.dashboard,
    VITE_GOVERNANCE_ADMIN_CAP: () => config.governance.adminCap,
  },
};

// Generate header for .env file
function generateHeader(): string {
  return `# Auto-generated from @nasun/devnet-config
# Version: ${config.version}
# Generated: ${new Date().toISOString()}
# DO NOT EDIT MANUALLY - Run 'pnpm devnet:sync' to update
#
# Manual additions below the AUTO-GENERATED section will be preserved.

`;
}

// Generate env content
function generateEnvContent(mapping: Record<string, () => string>): string {
  const lines: string[] = [];

  for (const [key, getValue] of Object.entries(mapping)) {
    const value = getValue();
    lines.push(`${key}=${value}`);
  }

  return lines.join('\n');
}

// Read existing .env and extract manual additions
function extractManualAdditions(envPath: string): string {
  if (!fs.existsSync(envPath)) {
    return '';
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const marker = '# MANUAL ADDITIONS BELOW';
  const markerIndex = content.indexOf(marker);

  if (markerIndex === -1) {
    // Check for zkLogin and other manual config that should be preserved
    const preservePatterns = [
      /^VITE_GOOGLE_CLIENT_ID=.*/m,
      /^VITE_ZKLOGIN_.*/m,
      /^VITE_BACKEND_URL=.*/m,
    ];

    const preservedLines: string[] = [];
    for (const line of content.split('\n')) {
      for (const pattern of preservePatterns) {
        if (pattern.test(line)) {
          preservedLines.push(line);
          break;
        }
      }
    }

    if (preservedLines.length > 0) {
      return `\n${marker}\n${preservedLines.join('\n')}`;
    }

    return '';
  }

  return content.slice(markerIndex);
}

// Sync env file
function syncEnvFile(appPath: string, mapping: Record<string, () => string>): void {
  const envPath = path.join(ROOT, appPath, '.env.local');
  const manualAdditions = extractManualAdditions(envPath);

  const content = generateHeader() + generateEnvContent(mapping) + manualAdditions;

  fs.writeFileSync(envPath, content);
  console.log(`  Synced: ${appPath}/.env.local`);
}

// Main
function main(): void {
  console.log(`\nSyncing devnet IDs (${config.version}) to app .env files...\n`);

  for (const [appPath, mapping] of Object.entries(ENV_MAPPINGS)) {
    const fullPath = path.join(ROOT, appPath);
    if (fs.existsSync(fullPath)) {
      syncEnvFile(appPath, mapping);
    } else {
      console.log(`  Skipped: ${appPath} (directory not found)`);
    }
  }

  console.log('\nDone! Remember to restart your dev servers.\n');
}

main();
