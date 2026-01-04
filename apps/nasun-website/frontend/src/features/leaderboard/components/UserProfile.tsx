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
      <div className="flex items-center space-x-2 md:space-x-3">
        <div className="flex-shrink-0 relative">
          {profileImageUrl && !imageError ? (
            <>
              {/* 로딩 중 플레이스홀더 - responsive size */}
              {!imageLoaded && (
                <div className="absolute inset-0 h-8 w-8 md:h-10 md:w-10 rounded-2xl bg-gray-700 animate-pulse flex items-center justify-center">
                  <span className="text-gray-400 text-xs md:text-base">
                    {(displayName || username || "N").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* 실제 이미지 - responsive size */}
              <img
                alt={displayName || "User profile"}
                src={profileImageUrl}
                loading="lazy"
                width={40}
                height={40}
                className={`h-8 w-8 md:h-10 md:w-10 rounded-2xl ${imageLoaded ? "opacity-100" : "opacity-0"} ${
                  xUrl ? "cursor-pointer hover:opacity-80 hover:scale-105" : ""
                }`}
                onClick={xUrl ? handleClick : undefined}
                onError={handleImageError}
                onLoad={handleImageLoad}
                style={{
                  objectFit: "cover",
                  backgroundColor: "var(--nasun-white)",
                }}
              />
            </>
          ) : (
            // 이미지 로딩 실패 시 표시되는 대체 아이콘 - responsive size
            <div
              className={`h-8 w-8 md:h-10 md:w-10 rounded-2xl bg-gray-700 flex items-center justify-center ${
                xUrl
                  ? "cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 hover:scale-105"
                  : ""
              }`}
              onClick={xUrl ? handleClick : undefined}
            >
              <span className="font-medium text-black dark:text-white text-xs md:text-base">
                {(displayName || username || "N").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 max-w-[80px] md:max-w-[180px]">
          <p
            className={`!font-medium text-black dark:text-white truncate text-sm md:text-base ${
              xUrl
                ? "cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 hover:scale-105"
                : ""
            }`}
            onClick={xUrl ? handleClick : undefined}
          >
            {displayName}
          </p>
          {/* @username hidden on mobile */}
          <p className="hidden md:block text-sm !text-gray-400 truncate">@{username}</p>
        </div>
      </div>
    );
  }
);

UserProfile.displayName = "UserProfile";

export default UserProfile;
