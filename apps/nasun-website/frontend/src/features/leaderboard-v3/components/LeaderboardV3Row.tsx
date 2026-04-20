/**
 * LeaderboardV3Row Component
 *
 * Individual row in the leaderboard table with rank change indicator.
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SeasonLeaderboardEntry } from "../types";
import { RankChangeIndicatorV3 } from "./RankChangeIndicatorV3";

const failedAvatarUrls = new Set<string>();

interface LeaderboardV3RowProps {
  entry: SeasonLeaderboardEntry;
  isHighlighted?: boolean;
}

function DefaultAvatar({ username }: { username: string }) {
  const initial = (username || "?").charAt(0).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-sm bg-nasun-nw3/30 border border-nasun-nw3/40 flex items-center justify-center flex-shrink-0">
      <span className="text-nasun-nw4 font-semibold text-sm">{initial}</span>
    </div>
  );
}

function RowAvatar({ url, username }: { url: string; username: string }) {
  const [failed, setFailed] = useState(() => failedAvatarUrls.has(url));
  if (failed) return <DefaultAvatar username={username} />;
  return (
    <img
      src={url}
      alt={username}
      className="w-9 h-9 rounded-sm object-cover flex-shrink-0"
      loading="lazy"
      onError={() => {
        failedAvatarUrls.add(url);
        setFailed(true);
      }}
    />
  );
}

const rankNumColor: Record<number, string> = {
  1: "text-nasun-c1 font-bold",
  2: "text-nasun-nw5 font-bold",
  3: "text-nasun-nw1 font-bold",
};

const LeaderboardV3Row: React.FC<LeaderboardV3RowProps> = ({ entry, isHighlighted = false }) => {
  const { t } = useTranslation("leaderboard");
  const isTopThree = entry.rank <= 3;

  return (
    <div
      data-username={entry.username}
      className={`grid grid-cols-12 gap-4 px-6 py-2.5 items-center transition-colors ${
        isHighlighted
          ? "bg-nasun-nw2/20 border-l-2 border-nasun-nw1"
          : "hover:bg-nasun-nw3/10"
      }`}
    >
      {/* Rank */}
      <div className="col-span-2 flex items-center">
        <span className={`text-sm tabular-nums ${isTopThree ? rankNumColor[entry.rank] : "text-nasun-nw4"}`}>
          {entry.rank}
        </span>
      </div>

      {/* User with Avatar */}
      <div className="col-span-6 flex items-center gap-2.5 min-w-0">
        {entry.profileImageUrl
          ? <RowAvatar url={entry.profileImageUrl} username={entry.username} />
          : <DefaultAvatar username={entry.username} />
        }

        <div className="min-w-0 flex-1">
          {entry.displayName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-nasun-white font-medium truncate min-w-0 text-sm leading-tight">{entry.displayName}</span>
              {entry.isRegistered && (
                <span
                  className="inline-flex items-center justify-center w-4 h-4 bg-nasun-c7/20 rounded-full flex-shrink-0"
                  title={t("v3.table.registeredMember")}
                >
                  <svg className="w-2.5 h-2.5 text-nasun-c7" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              {entry.isTelegramMember && (
                <span
                  className="inline-flex items-center justify-center w-4 h-4 bg-sky-500/20 rounded-full flex-shrink-0"
                  title={t("v3.table.telegramMember")}
                >
                  <svg className="w-2.5 h-2.5 text-sky-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </div>
          )}
          <a
            href={`https://x.com/${entry.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:text-nasun-nw1 truncate block text-sm transition-colors ${
              entry.displayName ? "text-nasun-nw4" : "text-nasun-white font-medium"
            }`}
          >
            @{entry.originalUsername || entry.username}
          </a>
        </div>
      </div>

      {/* Score */}
      <div className="col-span-2 text-right">
        <span className="text-nasun-nw1 font-semibold text-sm tabular-nums">{entry.userScore.toFixed(3)}</span>
      </div>

      {/* Rank Change */}
      <div className="col-span-2 flex justify-center">
        {entry.rankChange ? (
          <RankChangeIndicatorV3
            direction={entry.rankChange.direction}
            amount={entry.rankChange.amount}
            variant="short"
          />
        ) : (
          <span className="text-nasun-nw4 text-sm">-</span>
        )}
      </div>
    </div>
  );
};

export default LeaderboardV3Row;
