import React, { memo } from 'react';
import { EngagementStats } from '../types';
import { ENGAGEMENT_BADGE_STYLES } from '../constants';

interface EngagementBadgesProps extends EngagementStats {
  layout: 'row' | 'column';
}

const EngagementBadges: React.FC<EngagementBadgesProps> = memo(({
  totalReplies,
  totalLikes,
  totalReposts,
  totalQuotes,
  layout = 'column'
}) => {
  const badges = [
    {
      ...ENGAGEMENT_BADGE_STYLES.replies,
      value: totalReplies,
    },
    {
      ...ENGAGEMENT_BADGE_STYLES.likes,
      value: totalLikes,
    },
    {
      ...ENGAGEMENT_BADGE_STYLES.reposts,
      value: totalReposts || 0,
    },
    {
      ...ENGAGEMENT_BADGE_STYLES.quotes,
      value: totalQuotes || 0,
    }
  ];

  if (layout === 'row') {
    return (
      <>
        {badges.map((badge, index) => (
          <td key={index} className="px-6 py-4 whitespace-nowrap">
            <div className="text-gray-900">
              <span className={`inline-flex items-center px-2 py-1 rounded-lg-full font-medium ${badge.bgColor} ${badge.textColor}`}>
                {badge.icon} {badge.value}
              </span>
            </div>
          </td>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-1">
      {badges.map((badge, index) => (
        <span
          key={index}
          className={`inline-flex items-center px-2 py-1 rounded-lg-full font-medium ${badge.bgColor} ${badge.textColor} mr-1`}
        >
          {badge.icon} {badge.value}
        </span>
      ))}
    </div>
  );
});

EngagementBadges.displayName = 'EngagementBadges';

export default EngagementBadges;