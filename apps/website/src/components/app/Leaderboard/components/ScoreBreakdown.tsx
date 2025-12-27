import React, { memo } from 'react';
import { EngagementStats } from '../types';
import { SCORE_WEIGHTS } from '../constants';
import { useTranslation } from 'react-i18next';

const ScoreBreakdown: React.FC<EngagementStats> = memo(({
  totalReplies,
  totalLikes,
  totalReposts,
  totalQuotes
}) => {
  const { t } = useTranslation('leaderboard');
  
  return (
    <div className="text-gray-400 space-y-0.5 p-2 bg-gray-700 rounded-lg border border-gray-600">
      <div>❤️ {totalLikes} × {SCORE_WEIGHTS.likes} = {(totalLikes * SCORE_WEIGHTS.likes).toFixed(1)}</div>
      <div>🔁 {totalReposts || 0} × {SCORE_WEIGHTS.reposts} = {((totalReposts || 0) * SCORE_WEIGHTS.reposts).toFixed(1)}</div>
      <div>💬 {totalReplies} × {SCORE_WEIGHTS.replies} = {(totalReplies * SCORE_WEIGHTS.replies).toFixed(1)}</div>
      <div>🗣️ {totalQuotes || 0} × {SCORE_WEIGHTS.quotes} = {((totalQuotes || 0) * SCORE_WEIGHTS.quotes).toFixed(1)}</div>
      <div className="text-gray-500 border-t mt-1 pt-1">
        {t('scoreBreakdown.total')}: {(
          totalLikes * SCORE_WEIGHTS.likes + 
          (totalReposts || 0) * SCORE_WEIGHTS.reposts + 
          totalReplies * SCORE_WEIGHTS.replies + 
          (totalQuotes || 0) * SCORE_WEIGHTS.quotes
        ).toFixed(1)}
      </div>
    </div>
  );
});

ScoreBreakdown.displayName = 'ScoreBreakdown';

export default ScoreBreakdown;