/**
 * AdminPage
 * Unified admin dashboard with tabs for different admin features
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAccess } from '../features/admin';
import { PredictionAdminPanel } from '../features/prediction/components/PredictionAdminPanel';
import { LotteryAdminPanel } from '../features/lottery/components/LotteryAdminPanel';

type AdminTab = 'prediction' | 'lottery';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'prediction', label: 'Prediction' },
  { id: 'lottery', label: 'Lottery' },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('prediction');
  const { isAdmin, isPredictionAdmin, isLotteryAdmin, isLoading } = useAdminAccess();

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <div className="animate-pulse">
            <div className="h-8 bg-theme-bg-tertiary rounded w-48 mx-auto mb-4" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-64 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-theme-bg-secondary rounded-xl p-6 text-center">
          <div className="text-red-500 text-5xl mb-4">X</div>
          <h2 className="text-xl font-bold text-theme-text-primary mb-2">
            Access Denied
          </h2>
          <p className="text-theme-text-muted mb-4">
            You don't have permission to access the admin panel.
            Connect a wallet with AdminCap to continue.
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          <h1 className="text-2xl font-bold text-theme-text-primary">Admin</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-theme-text-secondary">
          {isPredictionAdmin && (
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
              Prediction
            </span>
          )}
          {isLotteryAdmin && (
            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">
              Lottery
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-theme-bg-secondary rounded-lg p-1">
        {TABS.map((tab) => {
          const isDisabled =
            (tab.id === 'prediction' && !isPredictionAdmin) ||
            (tab.id === 'lottery' && !isLotteryAdmin);

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-theme-accent text-white'
                  : isDisabled
                    ? 'text-theme-text-muted cursor-not-allowed'
                    : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
              }`}
            >
              {tab.label}
              {isDisabled && ' (No Access)'}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'prediction' && isPredictionAdmin && <PredictionAdminPanel />}
        {activeTab === 'lottery' && isLotteryAdmin && <LotteryAdminPanel />}

        {/* Fallback if no access to selected tab */}
        {activeTab === 'prediction' && !isPredictionAdmin && (
          <div className="bg-theme-bg-secondary rounded-xl p-6 text-center text-theme-text-muted">
            You don't have Prediction AdminCap
          </div>
        )}
        {activeTab === 'lottery' && !isLotteryAdmin && (
          <div className="bg-theme-bg-secondary rounded-xl p-6 text-center text-theme-text-muted">
            You don't have Lottery AdminCap
          </div>
        )}
      </div>
    </div>
  );
}
