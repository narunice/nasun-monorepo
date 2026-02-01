/**
 * ActionsList Component
 *
 * Displays transaction actions in a user-friendly list format.
 * Uses natural language labels and intuitive icons.
 *
 * UX Principle: Show what will happen in plain language
 *
 * Action display mapping:
 * - send → "Send to..." (arrow up)
 * - receive → "Receive from..." (arrow down)
 * - swap → "Swap X for Y" (exchange arrows)
 * - approve → "Allow spending" (shield)
 * - stake → "Stake tokens" (lock)
 */

import type { TxAction, TxActionIcon, TxActionType } from '@nasun/wallet';
import { InlineTooltip } from '../shared';

export interface ActionsListProps {
  /** List of transaction actions */
  actions: TxAction[];
  /** Display mode */
  variant?: 'compact' | 'detailed';
  /** Maximum actions to show before "show more" */
  maxVisible?: number;
  /** Show action icons */
  showIcons?: boolean;
  /** Additional class names */
  className?: string;
}

/** Action type configuration */
interface ActionConfig {
  /** Icon character/emoji */
  icon: string;
  /** CSS classes for the icon */
  iconStyles: string;
  /** Default label prefix */
  labelPrefix: string;
  /** Tooltip explanation */
  tooltip: string;
}

/** Configuration for each action type */
const ACTION_CONFIG: Record<TxActionType, ActionConfig> = {
  send: {
    icon: '↑',
    iconStyles: 'text-red-500 dark:text-red-400',
    labelPrefix: 'Send',
    tooltip: 'This will transfer tokens from your wallet',
  },
  receive: {
    icon: '↓',
    iconStyles: 'text-green-500 dark:text-green-400',
    labelPrefix: 'Receive',
    tooltip: 'You will receive tokens in your wallet',
  },
  swap: {
    icon: '⇄',
    iconStyles: 'text-blue-500 dark:text-blue-400',
    labelPrefix: 'Swap',
    tooltip: 'Exchange one token for another',
  },
  approve: {
    icon: '🛡',
    iconStyles: 'text-yellow-500 dark:text-yellow-400',
    labelPrefix: 'Allow spending',
    tooltip: 'Grant permission for a contract to use your tokens',
  },
  revoke: {
    icon: '🚫',
    iconStyles: 'text-gray-500 dark:text-gray-400',
    labelPrefix: 'Revoke access',
    tooltip: 'Remove spending permission for this contract',
  },
  stake: {
    icon: '🔒',
    iconStyles: 'text-purple-500 dark:text-purple-400',
    labelPrefix: 'Stake',
    tooltip: 'Lock your tokens to earn rewards',
  },
  unstake: {
    icon: '🔓',
    iconStyles: 'text-purple-500 dark:text-purple-400',
    labelPrefix: 'Unstake',
    tooltip: 'Withdraw your staked tokens',
  },
  vote: {
    icon: '✓',
    iconStyles: 'text-cyan-500 dark:text-cyan-400',
    labelPrefix: 'Vote',
    tooltip: 'Cast your vote in governance',
  },
  mint: {
    icon: '+',
    iconStyles: 'text-green-500 dark:text-green-400',
    labelPrefix: 'Mint',
    tooltip: 'Create new tokens',
  },
  burn: {
    icon: '−',
    iconStyles: 'text-red-500 dark:text-red-400',
    labelPrefix: 'Burn',
    tooltip: 'Permanently destroy tokens',
  },
  call: {
    icon: '⌘',
    iconStyles: 'text-gray-600 dark:text-gray-400',
    labelPrefix: 'Interact with',
    tooltip: 'Execute a contract function',
  },
};

/** Icon mapping from TxActionIcon to display character */
const ICON_MAP: Record<TxActionIcon, string> = {
  'arrow-up': '↑',
  'arrow-down': '↓',
  swap: '⇄',
  shield: '🛡',
  'shield-off': '🚫',
  lock: '🔒',
  unlock: '🔓',
  check: '✓',
  plus: '+',
  minus: '−',
  terminal: '⌘',
};

/**
 * Format address for display (truncate middle)
 */
function formatAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Transaction actions list component
 *
 * @example
 * // Basic usage
 * <ActionsList actions={txSummary.actions} />
 *
 * // Compact mode
 * <ActionsList actions={actions} variant="compact" maxVisible={3} />
 */
export function ActionsList({
  actions,
  variant = 'detailed',
  maxVisible = 5,
  showIcons = true,
  className = '',
}: ActionsListProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (actions.length === 0) {
    return (
      <div className={`text-gray-500 dark:text-gray-400 text-sm xl:text-base ${className}`}>
        No actions to display
      </div>
    );
  }

  const visibleActions = expanded ? actions : actions.slice(0, maxVisible);
  const hasMore = actions.length > maxVisible;

  return (
    <div className={`space-y-2 ${className}`}>
      {visibleActions.map((action, index) => (
        <ActionItem
          key={`${action.type}-${index}`}
          action={action}
          variant={variant}
          showIcon={showIcons}
        />
      ))}

      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm xl:text-base text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
        >
          Show {actions.length - maxVisible} more action
          {actions.length - maxVisible > 1 ? 's' : ''}
        </button>
      )}

      {hasMore && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm xl:text-base text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
        >
          Show less
        </button>
      )}
    </div>
  );
}

/** Import React for useState */
import * as React from 'react';

interface ActionItemProps {
  action: TxAction;
  variant: 'compact' | 'detailed';
  showIcon: boolean;
}

/**
 * Individual action item
 */
function ActionItem({ action, variant, showIcon }: ActionItemProps) {
  const config = ACTION_CONFIG[action.type];
  const icon = action.icon ? ICON_MAP[action.icon] : config.icon;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-sm xl:text-base">
        {showIcon && (
          <span className={`flex-shrink-0 ${config.iconStyles}`}>{icon}</span>
        )}
        <span className="text-gray-700 dark:text-gray-300">{action.label}</span>
        <span className="font-medium text-gray-900 dark:text-white truncate">
          {formatAddress(action.value)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
      {showIcon && (
        <InlineTooltip tooltip={config.tooltip}>
          <span
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-lg xl:text-xl ${config.iconStyles}`}
          >
            {icon}
          </span>
        </InlineTooltip>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">
            {action.label}
          </span>
          {action.sublabel && (
            <span className="text-xs xl:text-sm text-gray-500 dark:text-gray-400">
              {action.sublabel}
            </span>
          )}
        </div>

        <div className="mt-0.5 text-sm xl:text-base text-gray-600 dark:text-gray-300 font-mono truncate">
          {action.value}
        </div>
      </div>
    </div>
  );
}

/**
 * Get action config for external use
 */
export function getActionConfig(type: TxActionType): ActionConfig {
  return ACTION_CONFIG[type];
}

/**
 * Get icon for action type
 */
export function getActionIcon(type: TxActionType, customIcon?: TxActionIcon): string {
  return customIcon ? ICON_MAP[customIcon] : ACTION_CONFIG[type].icon;
}
