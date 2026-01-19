/**
 * 🆕 Phase 1: MyRankCard Component
 * 🔄 Phase 3: Social Sharing 통합 (ShareDropdown을 개별 버튼으로 리팩토링)
 *
 * @description
 * 로그인한 사용자의 현재 랭킹을 표시하는 카드 컴포넌트입니다.
 * 4가지 시나리오를 지원합니다:
 * 1. Twitter 미연동
 * 2. 랭크 없음 (참여 안 함)
 * 3. 정상 랭크됨
 * 4. 스냅샷 모드
 *
 * @author Claude Code
 * @date 2025-10-24
 */

import { memo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { useMyRank } from "../hooks";
import { CumulativePeriod } from "../types";
import { UserRankData } from "../types/leaderboard";
import RankChangeIndicator from "./RankChangeIndicator";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { toast } from "react-toastify";
// html2canvas is dynamically imported to reduce initial bundle size

interface MyRankCardProps {
  period: CumulativePeriod;
  date?: string;
  onBackToLatest?: () => void;
  onViewRank?: (page: number, username: string) => void;
}

export interface MyRankCardRef {
  handleShareToTwitter: () => Promise<void>;
  handleCopyLink: () => Promise<void>;
  handleDownloadImage: () => Promise<void>;
  getUserRank: () => UserRankData | null;
  getIsGeneratingImage: () => boolean;
}

const MyRankCardComponent = forwardRef<MyRankCardRef, MyRankCardProps>(
  ({ period, date, onBackToLatest }, ref) => {
    const { t } = useTranslation("leaderboard");
    const { data, isLoading } = useMyRank({ period, date });
    const { signInWithTwitter } = useAuth();
    const cardRef = useRef<HTMLDivElement>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);

    const handleSignIn = async () => {
      try {
        if (!import.meta.env.VITE_TWITTER_AUTH_API) {
          console.warn(
            "Twitter Auth API is not configured. Please set VITE_TWITTER_AUTH_API in .env"
          );
          return;
        }
        await signInWithTwitter();
      } catch (error) {
        console.error(`twitter sign-in failed:`, error);
      }
    };

    // Expose handlers to parent component via ref
    useImperativeHandle(ref, () => ({
      handleShareToTwitter,
      handleCopyLink,
      handleDownloadImage,
      getUserRank: () => data.userRank || null,
      getIsGeneratingImage: () => isGeneratingImage,
    }));

    const getShareUrl = (): string => {
      const baseUrl = window.location.origin;
      const path = "/leaderboard";
      const params = new URLSearchParams();
      if (data.userRank?.username) {
        params.append("period", period.toLowerCase());
        params.append("username", data.userRank.username);
        if (date) {
          params.append("date", date);
        }
      }
      return `${baseUrl}${path}?${params.toString()}`;
    };

    const getShareMessage = (): string => {
      if (!data.userRank) return "";

      const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";

      // Safe score calculation: finalScore → totalScore → 0
      const score = (data.userRank.finalScore ?? data.userRank.totalScore ?? 0).toFixed(2);

      if (date) {
        return t("share.message.snapshot", {
          rank: data.userRank.rank,
          username: data.userRank.username,
          score,
          date,
          targetAccount,
        });
      } else {
        return t("share.message.live", {
          rank: data.userRank.rank,
          username: data.userRank.username,
          score,
          targetAccount,
        });
      }
    };

    const copyImageToClipboard = async (): Promise<boolean> => {
      if (!cardRef?.current) {
        return false;
      }

      try {
        const isDarkMode = document.documentElement.classList.contains("dark");
        const backgroundColor = isDarkMode ? "#1f2937" : "#f3f4f6";
        await document.fonts.ready;

        // Dynamically import html2canvas (reduces initial bundle by ~204KB)
        const html2canvas = await import("html2canvas").then((m) => m.default);
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor,
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: false,
          imageTimeout: 15000,
        });

        // Canvas를 Blob으로 변환
        return new Promise((resolve) => {
          canvas.toBlob(async (blob) => {
            if (!blob) {
              resolve(false);
              return;
            }

            try {
              // ClipboardItem으로 래핑하여 클립보드에 복사
              const item = new ClipboardItem({ "image/png": blob });
              await navigator.clipboard.write([item]);
              resolve(true);
            } catch (clipboardError) {
              console.error("❌ [MyRankCard] Clipboard write failed:", clipboardError);
              resolve(false);
            }
          }, "image/png");
        });
      } catch (error) {
        console.error("❌ [MyRankCard] Failed to capture image:", error);
        return false;
      }
    };

    const handleShareToTwitter = async () => {
      // 1. 이미지를 클립보드에 복사 시도
      const copied = await copyImageToClipboard();

      // 2. Twitter 공유 창 열기
      const message = getShareMessage();
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;
      window.open(twitterUrl, "_blank", "width=550,height=420");

      // 3. 결과에 따른 토스트 메시지
      if (copied) {
        toast.success(t("share.toast.imageClipboardCopied"));
      } else {
        toast.warning(t("share.toast.clipboardFailed"));
      }
    };

    const handleCopyLink = async () => {
      const url = getShareUrl();
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t("share.toast.linkCopied"));
      } catch (error) {
        console.error("❌ [MyRankCard] Failed to copy link:", error);
        toast.error(t("share.toast.linkCopyFailed"));
      }
    };

    const handleDownloadImage = async () => {
      if (!cardRef?.current) {
        toast.error(t("share.toast.imageCaptureFailed"));
        return;
      }
      setIsGeneratingImage(true);
      toast.info(t("share.toast.imageGenerating"));
      try {
        const isDarkMode = document.documentElement.classList.contains("dark");
        const backgroundColor = isDarkMode ? "#1f2937" : "#f3f4f6";
        await document.fonts.ready;
        // Dynamically import html2canvas (reduces initial bundle by ~204KB)
        const html2canvas = await import("html2canvas").then((m) => m.default);
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor,
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: false,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            // 복제된 DOM에서 버튼 정렬 강제 적용 (html2canvas Flexbox 제약 우회)
            const buttons = clonedDoc.querySelectorAll("button");
            buttons.forEach((btn) => {
              btn.style.display = "flex";
              btn.style.alignItems = "center";
              btn.style.justifyContent = "center";
            });
          },
        });
        canvas.toBlob((blob) => {
          if (!blob) {
            toast.error(t("share.toast.imageGenerateFailed"));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          if (data.userRank?.username) {
            link.download = `nasun-leaderboard-${data.userRank.username}-rank${data.userRank.rank}.png`;
          }
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success(t("share.toast.imageDownloaded"));
        }, "image/png");
      } catch (error) {
        console.error("❌ [MyRankCard] Failed to generate image:", error);
        toast.error(t("share.toast.imageGenerateFailed"));
      } finally {
        setIsGeneratingImage(false);
      }
    };

    if (isLoading || data.status === "loading") {
      return (
        <div className="mb-6 p-6 bg-nasun-black transition-all   rounded-lg ">
          <div className="flex items-center justify-center">
            <div className="animate-pulse text-nasun-white/70">{t("myRank.loading")}</div>
          </div>
        </div>
      );
    }

    if (data.status === "no_twitter") {
      return (
        <div className="mb-6 p-6 bg-nasun-c4/30 border-1 border-nasun-white/20 rounded-lg min-h-[230px] flex flex-col justify-center">
          <div className="text-center space-y-3">
            <h6 className="">{t("myRank.noTwitter.title")}</h6>{" "}
            <Button onClick={handleSignIn} variant="c3">
              {t("myRank.noTwitter.linkButton")}
            </Button>
          </div>
        </div>
      );
    }

    if (data.status === "not_ranked") {
      return (
        <div className="mb-6 p-6 bg-nasun-c4/30 border-1 border-nasun-white/20 rounded-lg min-h-[230px] flex flex-col justify-center">
          <div className="text-center space-y-3">
            <h3 className="font-semibold">{t("myRank.notRanked.title")}</h3>
            <p className="text-nasun-white/70">{t("myRank.notRanked.description")}</p>
            <Button variant="c4" asChild>
              <a
                href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("myRank.notRanked.findTargetTweets")}
              </a>
            </Button>
          </div>
        </div>
      );
    }

    if (data.status === "error") {
      return (
        <div className="mb-6 p-6 bg-gray-800 border-1 border-red-800 rounded-lg ">
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-red-400">{t("myRank.error")}</h3>
            {data.error && <p className="text-red-300">{data.error}</p>}
          </div>
        </div>
      );
    }

    const userRank = data.userRank!;

    return (
      <div
        ref={cardRef}
        className="mb-6 p-6 bg-gradient-to-r from-nasun-c5/20 to-nasun-c4/40 border-1 border-nasun-c4/50 rounded-xl "
      >
        <div className="space-y-4">
          <h4 className="font-medium uppercase">{t("myRank.title")}</h4>

          {data.isSnapshotMode && (
            <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3">
              <p className="text-yellow-200">
                {t("myRank.snapshotMode.message")} ({date})
              </p>
              {onBackToLatest && (
                <Button
                  onClick={onBackToLatest}
                  variant="link"
                  size="sm"
                  className="mt-2 text-yellow-100 px-0"
                >
                  {t("myRank.snapshotMode.backButton")}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-nasun-c3">
                {t("myRank.rank", { rank: userRank.rank })}
              </span>
              <RankChangeIndicator rankChange={userRank.rankChange} />
            </div>
            <div className="text-nasun-white/70">
              {t("myRank.score", {
                score: (
                  userRank.entry.finalScore ||
                  userRank.finalScore ||
                  userRank.totalScore ||
                  0
                ).toFixed(2),
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-nasun-c4/50">
            {userRank.entry.profileImageUrl && (
              <img
                src={userRank.entry.profileImageUrl}
                alt={userRank.entry.displayName}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <div className="font-medium text-nasun-white">{userRank.entry.displayName}</div>
              <div className="text-nasun-white/60">@{userRank.username}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

MyRankCardComponent.displayName = "MyRankCard";

export const MyRankCard = memo(MyRankCardComponent);
