/**
 * Lottery round status badge
 */

import { ROUND_STATUS } from '../../index';

const STATUS_CONFIG = {
  [ROUND_STATUS.OPEN]: { label: 'OPEN', color: 'bg-green-500' },
  [ROUND_STATUS.CLOSED]: { label: 'CLOSED', color: 'bg-yellow-500' },
  [ROUND_STATUS.DRAWN]: { label: 'DRAWN', color: 'bg-blue-500' },
  [ROUND_STATUS.SETTLED]: { label: 'SETTLED', color: 'bg-gray-500' },
};

export function StatusBadge({ status }: { status: number }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || {
    label: 'UNKNOWN',
    color: 'bg-gray-400',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium text-white rounded ${config.color}`}>
      {config.label}
    </span>
  );
}
