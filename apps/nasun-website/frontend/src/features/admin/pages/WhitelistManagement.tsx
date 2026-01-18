import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useAuth } from '@/features/auth';
import {
  exportGenesisWhitelist,
  exportBattalionAllowlist,
  getWhitelistStats,
  downloadBlob,
  type WhitelistStats,
} from '../services/adminApi';

type TabType = 'genesis' | 'battalion';

export function WhitelistManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('genesis');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<WhitelistStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch stats on mount
  useEffect(() => {
    if (user?.identityId) {
      getWhitelistStats(user.identityId)
        .then(setStats)
        .catch((err) => console.error('Failed to fetch stats:', err));
    }
  }, [user?.identityId]);

  const handleExport = async (format: 'default' | 'opensea' = 'default') => {
    if (!user?.identityId) {
      setError('User not authenticated');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      if (activeTab === 'genesis') {
        const blob = await exportGenesisWhitelist({
          identityId: user.identityId,
          status: 'ACTIVE',
          format,
        });
        const date = new Date().toISOString().split('T')[0];
        const prefix = format === 'opensea' ? 'genesis-opensea-allowlist' : 'genesis-nft-whitelist';
        downloadBlob(blob, `${prefix}-active-${date}.csv`);
      } else {
        const blob = await exportBattalionAllowlist({
          identityId: user.identityId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          format,
        });
        const date = new Date().toISOString().split('T')[0];
        let suffix = 'all';
        if (startDate || endDate) {
          suffix = `${startDate || 'start'}-to-${endDate || 'end'}`;
        }
        const prefix = format === 'opensea' ? 'battalion-opensea-allowlist' : 'battalion-nft-allowlist';
        downloadBlob(blob, `${prefix}-${suffix}-${date}.csv`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Whitelist Export</h1>
        <p className="text-white/60 mb-8">
          Download NFT whitelist data as CSV files.
        </p>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <p className="text-white/60 text-sm">Genesis NFT Whitelist</p>
              <p className="text-2xl font-bold text-nasun-c3">{stats.genesis.active.toLocaleString()} Active</p>
              <p className="text-sm text-white/50 mt-1">
                Total {stats.genesis.total.toLocaleString()} registered / {stats.genesis.withdrawn.toLocaleString()} withdrawn
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <p className="text-white/60 text-sm">Battalion NFT Allowlist</p>
              <p className="text-2xl font-bold text-nasun-c3">{stats.battalion.active.toLocaleString()} Active</p>
              <p className="text-sm text-white/50 mt-1">
                Total {stats.battalion.total.toLocaleString()} registered / {stats.battalion.withdrawn.toLocaleString()} withdrawn
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('genesis')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'genesis'
                ? 'bg-nasun-c4 text-white'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            Genesis NFT Whitelist
          </button>
          <button
            onClick={() => setActiveTab('battalion')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'battalion'
                ? 'bg-nasun-c4 text-white'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            Battalion NFT Allowlist
          </button>
        </div>

        {/* Export Card */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {activeTab === 'genesis' ? 'Genesis NFT Whitelist' : 'Battalion NFT Allowlist'}
          </h2>

          <p className="text-white/60 text-sm mb-6">
            {activeTab === 'genesis'
              ? 'Export wallet addresses registered for the Genesis NFT whitelist.'
              : 'Export wallet addresses registered for the Battalion NFT allowlist with date filtering.'}
          </p>

          {/* Date Filter (Battalion only) */}
          {activeTab === 'battalion' && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm text-white/70 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-nasun-c4"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-nasun-c4"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Export Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleExport('default')}
              disabled={isExporting}
              className="px-6 py-3 bg-nasun-c4 text-white rounded-lg hover:bg-nasun-c5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? 'Exporting...' : 'Download CSV'}
            </button>
            <button
              onClick={() => handleExport('opensea')}
              disabled={isExporting}
              className="px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
            >
              {isExporting ? 'Exporting...' : 'Download for OpenSea'}
            </button>
          </div>
        </div>

        {/* CSV Format Info */}
        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg">
          <h3 className="text-white font-medium mb-2">CSV Format</h3>
          {activeTab === 'genesis' ? (
            <div className="space-y-2">
              <p className="text-white/60 text-sm">
                <span className="text-white/80">Default:</span> walletAddress, joinedAt, signature, status, withdrawnAt
              </p>
              <p className="text-white/60 text-sm">
                <span className="text-white/80">OpenSea:</span> Wallet address, Custom mint limit (optional), Custom price in native token e.g. ETH (optional)
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-white/60 text-sm">
                <span className="text-white/80">Default:</span> walletAddress, verifiedAt, xUserId, xUsername, allowlistBatchId, status
              </p>
              <p className="text-white/60 text-sm">
                <span className="text-white/80">OpenSea:</span> Wallet address, Custom mint limit (optional), Custom price in native token e.g. ETH (optional)
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
