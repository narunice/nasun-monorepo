import React, { memo, useCallback, useState } from "react";
import { CumulativeLeaderboardEntry as UserProfileType } from "../types";

interface UserProfileProps
  extends Pick<UserProfileType, "displayName" | "username" | "profileImageUrl"> {
  xUrl?: string;
}

const UserProfile: React.FC<UserProfileProps> = memo(
  ({ displayName, username, profileImageUrl, xUrl }) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    const handleClick = useCallback(() => {
      if (xUrl) {
        window.open(xUrl, "_blank");
      }
    }, [xUrl]);

    const handleImageError = useCallback(() => {
      setImageError(true);
    }, []);

    const handleImageLoad = useCallback(() => {
      setImageLoaded(true);
    }, []);

    return (
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0 relative">
          {profileImageUrl && !imageError ? (
            <>
              {/* 로딩 중 플레이스홀더 */}
              {!imageLoaded && (
                <div className="absolute inset-0 h-10 w-10 rounded-2xl bg-gray-700 animate-pulse flex items-center justify-center">
                  <span className="text-gray-400">
                    {(displayName || username || "N").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* 실제 이미지 - LazyLoadImage 제거하고 native lazy loading 사용 */}
              <img
                alt={displayName || "User profile"}
                src={profileImageUrl} // 원본 URL 사용 (fallback 로직 제거)
                loading="lazy" // native lazy loading 사용
                width={40}
                height={40}
                className={`h-10 w-10 rounded-2xl ${imageLoaded ? "opacity-100" : "opacity-0"} ${
                  xUrl ? "cursor-pointer hover:opacity-80 hover:scale-105" : ""
                }`}
                onClick={xUrl ? handleClick : undefined}
                onError={handleImageError}
                onLoad={handleImageLoad}
                style={{
                  // 이미지 로딩 최적화를 위한 스타일
                  objectFit: "cover",
                  backgroundColor: "var(--nasun-white)", // 로딩 중 배경색
                }}
              />
            </>
          ) : (
            // 이미지 로딩 실패 시 표시되는 대체 아이콘
            <div
              className={`h-10 w-10 rounded-2xl bg-gray-700 flex items-center justify-center ${
                xUrl
                  ? "cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 hover:scale-105"
                  : ""
              }`}
              onClick={xUrl ? handleClick : undefined}
            >
              <span className="font-medium text-black dark:text-white">
                {(displayName || username || "N").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 max-w-[180px]">
          <p
            className={`!font-medium text-black dark:text-white truncate ${
              xUrl
                ? "cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 hover:scale-105"
                : ""
            }`}
            onClick={xUrl ? handleClick : undefined}
          >
            {displayName}
          </p>
          <p className="text-sm !text-gray-400 truncate">@{username}</p>
        </div>
      </div>
    );
  }
);

UserProfile.displayName = "UserProfile";

export default UserProfile;
