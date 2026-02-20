import { useQuery } from '@tanstack/react-query';
import { getApiHealth } from '../../lib/explorer-api';

/**
 * Polls the Explorer API health endpoint and shows a warning banner
 * when a devnet chain reset is detected (indexer data is stale).
 */
export default function ChainResetBanner() {
  const { data } = useQuery({
    queryKey: ['api-health-chain-check'],
    queryFn: () => getApiHealth().catch(() => null),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });

  if (!data?.chainResetDetected) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-sm text-amber-400">
      Chain reset detected — Indexer is re-syncing. Some analytics data may be unavailable or stale.
    </div>
  );
}
