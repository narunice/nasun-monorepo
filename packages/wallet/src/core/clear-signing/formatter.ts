/**
 * Transaction Display Formatter
 *
 * Converts decoded transactions into human-readable summaries.
 * Provides risk analysis and action item generation.
 */

import type {
  DecodedTx,
  MoveDecodedTx,
  EVMDecodedTx,
  MoveCall,
  EVMCall,
  TxSummary,
  TxAction,
  TxActionType,
  TxActionIcon,
  TxCategory,
  TxRiskLevel,
  RiskAssessment,
  RiskFactor,
  TokenBalanceChange,
  SimulationResult,
  ClearSigningConfig,
} from './types';
import { DEFAULT_CLEAR_SIGNING_CONFIG } from './types';
import { shortenAddress } from './decoder';

// ============================================
// Configuration
// ============================================

let formatConfig: ClearSigningConfig = { ...DEFAULT_CLEAR_SIGNING_CONFIG };

/**
 * Set formatter configuration
 */
export function setFormatterConfig(config: Partial<ClearSigningConfig>): void {
  formatConfig = { ...formatConfig, ...config };
}

// ============================================
// Main Formatter
// ============================================

/**
 * Format decoded transaction into human-readable summary
 */
export function formatTransaction(
  decoded: DecodedTx,
  simulation?: SimulationResult
): TxSummary {
  if (decoded.chainType === 'move') {
    return formatMoveTransaction(decoded, simulation);
  } else {
    return formatEVMTransaction(decoded, simulation);
  }
}

// ============================================
// Move Transaction Formatter
// ============================================

/**
 * Format Move transaction
 */
function formatMoveTransaction(
  decoded: MoveDecodedTx,
  simulation?: SimulationResult
): TxSummary {
  const { calls, category, gasBudget, sponsor } = decoded;

  // Generate title and description
  const { title, description } = generateMoveTitle(calls, category);

  // Generate actions
  const actions = generateMoveActions(calls, simulation);

  // Calculate risk level
  const riskLevel = calculateMoveRiskLevel(calls, simulation);

  // Format gas cost
  const gasCost = formatGasCost(gasBudget, 'NSN', 9);

  return {
    title,
    description,
    category,
    riskLevel,
    actions,
    gasCost,
    isSponsored: !!sponsor,
  };
}

/**
 * Generate title for Move transaction
 */
function generateMoveTitle(
  calls: MoveCall[],
  category: TxCategory
): { title: string; description: string } {
  if (calls.length === 0) {
    return { title: 'Unknown Transaction', description: 'Unable to decode transaction' };
  }

  const mainCall = calls[0];
  const { module, function: func } = mainCall;

  // Category-based titles
  switch (category) {
    case 'transfer':
      return {
        title: 'Send Tokens',
        description: `Transfer tokens to another address`,
      };
    case 'swap':
      return {
        title: 'Swap Tokens',
        description: `Exchange tokens on ${module}`,
      };
    case 'stake':
      if (func.includes('unstake')) {
        return { title: 'Unstake', description: 'Withdraw staked tokens' };
      }
      return { title: 'Stake', description: 'Stake tokens for rewards' };
    case 'governance':
      if (func.includes('vote')) {
        return { title: 'Vote', description: 'Cast vote on proposal' };
      }
      return { title: 'Governance Action', description: `${module}::${func}` };
    case 'nft':
      if (func.includes('mint')) {
        return { title: 'Mint NFT', description: 'Create new NFT' };
      }
      return { title: 'NFT Action', description: `${module}::${func}` };
    case 'defi':
      return { title: 'DeFi Operation', description: `${module}::${func}` };
    case 'system':
      if (func.includes('upgrade')) {
        return { title: 'Upgrade Package', description: 'Upgrade smart contract' };
      }
      return { title: 'System Operation', description: `${module}::${func}` };
    default:
      return {
        title: 'Contract Interaction',
        description: `${module}::${func}`,
      };
  }
}

/**
 * Generate actions for Move transaction
 */
function generateMoveActions(
  calls: MoveCall[],
  simulation?: SimulationResult
): TxAction[] {
  const actions: TxAction[] = [];

  // Add balance change actions from simulation
  if (simulation?.balanceChanges) {
    for (const change of simulation.balanceChanges) {
      const isOutgoing = change.amount < 0n;
      actions.push({
        type: isOutgoing ? 'send' : 'receive',
        label: isOutgoing ? 'Send' : 'Receive',
        value: change.displayAmount,
        sublabel: change.symbol,
        icon: isOutgoing ? 'arrow-up' : 'arrow-down',
      });
    }
  }

  // Add call-based actions if no simulation
  if (actions.length === 0 && calls.length > 0) {
    for (const call of calls) {
      actions.push(moveCallToAction(call));
    }
  }

  return actions;
}

/**
 * Convert Move call to action
 */
function moveCallToAction(call: MoveCall): TxAction {
  const funcLower = call.function.toLowerCase();

  // Determine action type
  let type: TxActionType = 'call';
  let icon: TxActionIcon = 'terminal';
  let label = 'Call';

  if (funcLower.includes('transfer')) {
    type = 'send';
    icon = 'arrow-up';
    label = 'Transfer';
  } else if (funcLower.includes('swap')) {
    type = 'swap';
    icon = 'swap';
    label = 'Swap';
  } else if (funcLower.includes('stake')) {
    type = 'stake';
    icon = 'lock';
    label = 'Stake';
  } else if (funcLower.includes('unstake')) {
    type = 'unstake';
    icon = 'unlock';
    label = 'Unstake';
  } else if (funcLower.includes('vote')) {
    type = 'vote';
    icon = 'check';
    label = 'Vote';
  } else if (funcLower.includes('mint')) {
    type = 'mint';
    icon = 'plus';
    label = 'Mint';
  } else if (funcLower.includes('burn')) {
    type = 'burn';
    icon = 'minus';
    label = 'Burn';
  }

  return {
    type,
    label,
    value: `${call.module}::${call.function}`,
    sublabel: shortenAddress(call.package),
    icon,
  };
}

/**
 * Calculate risk level for Move transaction
 */
function calculateMoveRiskLevel(
  calls: MoveCall[],
  simulation?: SimulationResult
): TxRiskLevel {
  // Critical: simulation shows revert
  if (simulation?.willRevert) {
    return 'critical';
  }

  // Check each call for risk indicators
  for (const call of calls) {
    const funcLower = call.function.toLowerCase();

    // High risk: upgrades, admin functions
    if (
      funcLower.includes('upgrade') ||
      funcLower.includes('admin') ||
      funcLower.includes('destroy')
    ) {
      return 'high';
    }
  }

  // Medium: large value transfers
  if (simulation?.balanceChanges) {
    for (const change of simulation.balanceChanges) {
      if (
        change.usdValue &&
        change.usdValue > formatConfig.largeAmountThreshold
      ) {
        return 'medium';
      }
    }
  }

  return 'low';
}

// ============================================
// EVM Transaction Formatter
// ============================================

/**
 * Format EVM transaction
 */
function formatEVMTransaction(
  decoded: EVMDecodedTx,
  simulation?: SimulationResult
): TxSummary {
  const { call, to, value, category, gasLimit, maxFeePerGas } = decoded;

  // Generate title and description
  const { title, description } = generateEVMTitle(call, value, category);

  // Generate actions
  const actions = generateEVMActions(call, value, to, simulation);

  // Calculate risk level
  const riskLevel = calculateEVMRiskLevel(call, value, simulation);

  // Format gas cost
  const gasCost = maxFeePerGas
    ? formatGasCost(gasLimit * maxFeePerGas, 'ETH', 18)
    : formatGasCost(gasLimit * 20_000_000_000n, 'ETH', 18); // Assume 20 gwei

  return {
    title,
    description,
    category,
    riskLevel,
    actions,
    gasCost,
  };
}

/**
 * Generate title for EVM transaction
 */
function generateEVMTitle(
  call: EVMCall | undefined,
  value: bigint,
  category: TxCategory
): { title: string; description: string } {
  // Native transfer
  if (!call && value > 0n) {
    return {
      title: 'Send ETH',
      description: 'Transfer native currency',
    };
  }

  if (!call) {
    return { title: 'Contract Interaction', description: 'Unknown operation' };
  }

  const funcName = call.name?.toLowerCase() || '';

  // Known function names
  if (funcName === 'transfer') {
    return { title: 'Send Tokens', description: 'ERC-20 transfer' };
  }
  if (funcName === 'transferfrom') {
    return { title: 'Transfer From', description: 'ERC-20 transferFrom' };
  }
  if (funcName === 'approve') {
    return { title: 'Approve Spending', description: 'Allow contract to spend tokens' };
  }
  if (funcName === 'setapprovalforall') {
    return { title: 'Approve NFT Collection', description: 'Allow operator for all NFTs' };
  }
  if (funcName.includes('swap')) {
    return { title: 'Swap Tokens', description: 'Exchange tokens on DEX' };
  }
  if (funcName === 'permit') {
    return { title: 'Sign Permit', description: 'Gasless approval signature' };
  }

  // Category-based fallback
  switch (category) {
    case 'swap':
      return { title: 'Swap', description: 'Token exchange' };
    case 'defi':
      return { title: 'DeFi Operation', description: call.signature || 'Contract call' };
    default:
      return {
        title: 'Contract Call',
        description: call.signature || `Function: ${call.selector}`,
      };
  }
}

/**
 * Generate actions for EVM transaction
 */
function generateEVMActions(
  call: EVMCall | undefined,
  value: bigint,
  _to: string,
  simulation?: SimulationResult
): TxAction[] {
  const actions: TxAction[] = [];

  // Native value transfer
  if (value > 0n) {
    actions.push({
      type: 'send',
      label: 'Send',
      value: formatAmount(value, 18),
      sublabel: 'ETH',
      icon: 'arrow-up',
    });
  }

  // Add simulation balance changes
  if (simulation?.balanceChanges) {
    for (const change of simulation.balanceChanges) {
      const isOutgoing = change.amount < 0n;
      actions.push({
        type: isOutgoing ? 'send' : 'receive',
        label: isOutgoing ? 'Send' : 'Receive',
        value: change.displayAmount,
        sublabel: change.symbol,
        icon: isOutgoing ? 'arrow-up' : 'arrow-down',
      });
    }
  }

  // Add approval actions
  if (simulation?.approvalChanges) {
    for (const approval of simulation.approvalChanges) {
      if (approval.amount > 0n) {
        actions.push({
          type: 'approve',
          label: approval.isUnlimited ? 'Unlimited Approval' : 'Approve',
          value: approval.isUnlimited
            ? 'Unlimited'
            : formatAmount(approval.amount, 18),
          sublabel: `${approval.symbol} → ${shortenAddress(approval.spender)}`,
          icon: 'shield',
        });
      } else {
        actions.push({
          type: 'revoke',
          label: 'Revoke',
          value: approval.symbol,
          sublabel: shortenAddress(approval.spender),
          icon: 'shield-off',
        });
      }
    }
  }

  // Add call-based action if no other actions
  if (actions.length === 0 && call) {
    actions.push({
      type: 'call',
      label: call.name || 'Call',
      value: call.signature || call.selector,
      sublabel: call.contractName || shortenAddress(call.contract),
      icon: 'terminal',
    });
  }

  return actions;
}

/**
 * Calculate risk level for EVM transaction
 */
function calculateEVMRiskLevel(
  call: EVMCall | undefined,
  value: bigint,
  simulation?: SimulationResult
): TxRiskLevel {
  // Critical: simulation shows revert
  if (simulation?.willRevert) {
    return 'critical';
  }

  // Critical: unlimited approval
  if (simulation?.approvalChanges?.some((a) => a.isUnlimited)) {
    if (formatConfig.warnUnlimitedApproval) {
      return 'critical';
    }
  }

  // High: any approval
  if (
    call?.name?.toLowerCase() === 'approve' ||
    call?.name?.toLowerCase() === 'setapprovalforall'
  ) {
    return 'high';
  }

  // Medium: large value
  if (simulation?.balanceChanges) {
    for (const change of simulation.balanceChanges) {
      if (
        change.usdValue &&
        Math.abs(change.usdValue) > formatConfig.largeAmountThreshold
      ) {
        return 'medium';
      }
    }
  }

  // Medium: high native value
  if (value > 1_000_000_000_000_000_000n) {
    // > 1 ETH
    return 'medium';
  }

  return 'low';
}

// ============================================
// Risk Assessment
// ============================================

/**
 * Assess transaction risk
 */
export function assessRisk(
  decoded: DecodedTx,
  simulation?: SimulationResult
): RiskAssessment {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Simulation failure
  if (simulation && !simulation.success) {
    factors.push({
      level: 'critical',
      category: 'simulation',
      title: 'Simulation Failed',
      description: simulation.error || 'Transaction simulation failed',
      mitigation: 'Review transaction carefully before signing',
    });
    score += 50;
  }

  // Will revert
  if (simulation?.willRevert) {
    factors.push({
      level: 'critical',
      category: 'simulation',
      title: 'Transaction Will Fail',
      description: simulation.revertReason || 'Transaction is expected to revert',
      mitigation: 'Do not sign this transaction',
    });
    score += 100;
  }

  // Unlimited approval
  if (simulation?.approvalChanges?.some((a) => a.isUnlimited)) {
    factors.push({
      level: 'critical',
      category: 'approval',
      title: 'Unlimited Token Approval',
      description: 'This allows unlimited spending of your tokens',
      mitigation: 'Consider setting a specific amount limit',
    });
    score += 40;
  }

  // Large value
  const totalValue = simulation?.balanceChanges?.reduce(
    (sum, c) => sum + Math.abs(c.usdValue || 0),
    0
  ) || 0;

  if (totalValue > formatConfig.largeAmountThreshold) {
    factors.push({
      level: 'medium',
      category: 'value',
      title: 'Large Value Transaction',
      description: `Total value: $${totalValue.toFixed(2)}`,
      mitigation: 'Verify recipient and amount carefully',
    });
    score += 20;
  }

  // Unknown contract
  if (decoded.chainType === 'evm') {
    const evmTx = decoded as EVMDecodedTx;
    const contract = formatConfig.contractRegistry?.get(decoded.chainId, evmTx.to);
    if (!contract?.verified) {
      factors.push({
        level: 'medium',
        category: 'contract',
        title: 'Unverified Contract',
        description: 'This contract is not verified on the block explorer',
        mitigation: 'Research the contract before interacting',
      });
      score += 15;
    }
  }

  // Calculate overall risk
  let overallRisk: TxRiskLevel = 'low';
  if (score >= 50) overallRisk = 'critical';
  else if (score >= 30) overallRisk = 'high';
  else if (score >= 15) overallRisk = 'medium';

  return {
    overallRisk,
    factors,
    score: Math.min(score, 100),
    requiresExtraConfirmation: score >= 30,
  };
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format token amount for display
 */
export function formatAmount(
  amount: bigint,
  decimals: number,
  maxDecimals = 6
): string {
  const absAmount = amount < 0n ? -amount : amount;
  const sign = amount < 0n ? '-' : '';

  if (absAmount === 0n) return '0';

  const divisor = 10n ** BigInt(decimals);
  const whole = absAmount / divisor;
  const fractional = absAmount % divisor;

  if (fractional === 0n) {
    return sign + formatWithCommas(whole.toString());
  }

  const fractionalStr = fractional.toString().padStart(decimals, '0');

  // For small values, show enough precision to display non-zero
  // Find first non-zero digit position
  let effectiveMaxDecimals = maxDecimals;
  if (whole === 0n) {
    const firstNonZero = fractionalStr.search(/[1-9]/);
    if (firstNonZero >= maxDecimals) {
      // Show at least one significant digit
      effectiveMaxDecimals = firstNonZero + 2;
    }
  }

  const trimmed = fractionalStr.slice(0, effectiveMaxDecimals).replace(/0+$/, '');

  if (trimmed === '') {
    return sign + formatWithCommas(whole.toString());
  }

  return sign + formatWithCommas(whole.toString()) + '.' + trimmed;
}

/**
 * Format gas cost
 */
export function formatGasCost(
  gas: bigint,
  symbol: string,
  decimals: number
): string {
  const formatted = formatAmount(gas, decimals, 8);
  return `${formatted} ${symbol}`;
}

/**
 * Format number with commas
 */
function formatWithCommas(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format USD value
 */
export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format balance change for display
 */
export function formatBalanceChange(change: TokenBalanceChange): string {
  const sign = change.amount >= 0n ? '+' : '';
  const usd = change.usdValue ? ` (${formatUSD(change.usdValue)})` : '';
  return `${sign}${change.displayAmount} ${change.symbol}${usd}`;
}

/**
 * Get action icon class name
 */
export function getActionIconClass(icon: TxActionIcon): string {
  const iconMap: Record<TxActionIcon, string> = {
    'arrow-up': 'icon-arrow-up text-red-500',
    'arrow-down': 'icon-arrow-down text-green-500',
    'swap': 'icon-swap text-blue-500',
    'shield': 'icon-shield text-yellow-500',
    'shield-off': 'icon-shield-off text-gray-500',
    'lock': 'icon-lock text-purple-500',
    'unlock': 'icon-unlock text-purple-400',
    'check': 'icon-check text-green-500',
    'plus': 'icon-plus text-blue-500',
    'minus': 'icon-minus text-red-500',
    'terminal': 'icon-terminal text-gray-500',
  };
  return iconMap[icon] || 'icon-default';
}

/**
 * Get risk level color class
 */
export function getRiskLevelClass(level: TxRiskLevel): string {
  const colorMap: Record<TxRiskLevel, string> = {
    'low': 'text-green-500 bg-green-100',
    'medium': 'text-yellow-600 bg-yellow-100',
    'high': 'text-orange-500 bg-orange-100',
    'critical': 'text-red-600 bg-red-100',
  };
  return colorMap[level];
}

/**
 * Get category icon class
 */
export function getCategoryIconClass(category: TxCategory): string {
  const iconMap: Record<TxCategory, string> = {
    'transfer': 'icon-send',
    'swap': 'icon-swap',
    'stake': 'icon-lock',
    'governance': 'icon-vote',
    'nft': 'icon-image',
    'defi': 'icon-chart',
    'contract': 'icon-code',
    'system': 'icon-settings',
    'unknown': 'icon-question',
  };
  return iconMap[category];
}
