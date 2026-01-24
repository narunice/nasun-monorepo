/**
 * 🆕 Phase 3: ShareDropdown Component
 * 🔄 리디자인: 드롭다운 → 아이콘 버튼 3개 직접 표시
 *
 * @description
 * 리더보드 순위를 공유하는 아이콘 버튼 컴포넌트입니다.
 * - X/Twitter 공유
 * - 링크 복사
 * - 이미지 다운로드 (html2canvas)
 * - Tooltip으로 기능 설명
 *
 * @author Claude Code
 * @date 2025-10-23
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Link as LinkIcon, Download } from "lucide-react";
import { toast } from "react-toastify";
// html2canvas is dynamically imported in handleDownloadImage to reduce initial bundle size

export interface ShareDropdownProps {
  /** 공유할 랭킹 정보 */
  rank: number;
  username: string;
  score: number;
  period: string;
  /** 옵션: 스냅샷 날짜 (YYYY-MM-DD) */
  date?: string;
  /** 캡처할 요소의 ref (이미지 공유용) */
  captureRef?: React.RefObject<HTMLElement>;
}

/**
 * 공유 드롭다운 컴포넌트
 *
 * @example
 * const captureRef = useRef<HTMLDivElement>(null);
 *
 * <ShareDropdown
 *   rank={49}
 *   username="ToTheMoon7035"
 *   score={16.12}
 *   period="cumulative"
 *   captureRef={captureRef}
 * />
 */
export const ShareDropdown: React.FC<ShareDropdownProps> = ({
  rank,
  username,
  score,
  period,
  date,
  captureRef,
}) => {
  const { t } = useTranslation("leaderboard");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  /**
   * 공유 URL 생성
   */
  const getShareUrl = (): string => {
    const baseUrl = window.location.origin;
    const path = "/leaderboard";

    // URL 파라미터 생성
    const params = new URLSearchParams();
    params.append("period", period.toLowerCase());
    params.append("username", username);
    if (date) {
      params.append("date", date);
    }

    return `${baseUrl}${path}?${params.toString()}`;
  };

  /**
   * 공유 메시지 템플릿 생성 (X/Twitter용)
   */
  const getShareMessage = (): string => {
    const url = getShareUrl();

    if (date) {
      // 스냅샷 모드
      return t("share.message.snapshot", {
        rank,
        username,
        score: score.toFixed(2),
        date,
        url,
      });
    } else {
      // 실시간 모드
      return t("share.message.live", {
        rank,
        username,
        score: score.toFixed(2),
        url,
      });
    }
  };

  /**
   * X/Twitter 공유
   */
  const handleShareToTwitter = () => {
    const message = getShareMessage();
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;

    window.open(twitterUrl, "_blank", "width=550,height=420");
    toast.success(t("share.toast.twitterOpened"));
  };

  /**
   * 링크 복사
   */
  const handleCopyLink = async () => {
    const url = getShareUrl();

    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("share.toast.linkCopied"));
    } catch (error) {
      console.error("❌ [ShareDropdown] Failed to copy link:", error);
      toast.error(t("share.toast.linkCopyFailed"));
    }
  };

  /**
   * 이미지 생성 및 다운로드 (html2canvas)
   */
  const handleDownloadImage = async () => {
    if (!captureRef?.current) {
      toast.error(t("share.toast.imageCaptureFailed"));
      return;
    }

    setIsGeneratingImage(true);
    toast.info(t("share.toast.imageGenerating"));

    try {
      // 🎨 다크/라이트 모드에 따른 배경색 자동 감지
      const isDarkMode = document.documentElement.classList.contains("dark");
      const backgroundColor = isDarkMode
        ? "#1f2937" // bg-gray-800
        : "#f3f4f6"; // bg-gray-100

      // ⏳ 웹 폰트 로딩 완료 대기
      await document.fonts.ready;
      console.log("✅ [ShareDropdown] 폰트 로딩 완료");

      // Dynamically import html2canvas (reduces initial bundle by ~204KB)
      const html2canvas = await import("html2canvas").then((m) => m.default);
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor,
        scale: 2, // 고해상도
        logging: false,
        // CORS 이미지 허용 (프로필 이미지)
        useCORS: true,
        allowTaint: false,
        // 이미지 로드 타임아웃
        imageTimeout: 15000,
        // 🔧 레이아웃 및 스타일 문제 해결
        onclone: (clonedDoc) => {
          // 복제된 문서의 모든 요소에 대해 스타일 보정
          const allElements = clonedDoc.body.querySelectorAll("*");

          allElements.forEach((el) => {
            const element = el as HTMLElement;

            // 1️⃣ 모든 버튼에 강제 정렬 적용
            if (element.tagName === "BUTTON") {
              element.style.setProperty("display", "flex", "important");
              element.style.setProperty("align-items", "center", "important");
              element.style.setProperty("justify-content", "center", "important");
              element.style.setProperty("gap", "0.5rem", "important");
              element.style.setProperty("line-height", "1.5", "important");
              element.style.setProperty("font-size", "0.875rem", "important"); //

              // 버튼 내부의 모든 직접 자식 요소에도 정렬 적용
              Array.from(element.childNodes).forEach((child) => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                  const childEl = child as HTMLElement;
                  childEl.style.setProperty("vertical-align", "middle", "important");
                  childEl.style.setProperty("line-height", "1.5", "important");
                }
              });
            }

            // 2️⃣ SVG 아이콘 정렬 보정
            if (element.tagName === "SVG") {
              element.style.setProperty("display", "inline-block", "important");
              element.style.setProperty("vertical-align", "middle", "important");
              element.style.setProperty("flex-shrink", "0", "important");
            }

            // 3️⃣ flex 컨테이너 보정
            if (element.classList.contains("flex")) {
              element.style.setProperty("display", "flex", "important");
            }
            if (element.classList.contains("items-center")) {
              element.style.setProperty("align-items", "center", "important");
            }
            if (element.classList.contains("items-baseline")) {
              element.style.setProperty("align-items", "baseline", "important");
            }
            if (element.classList.contains("justify-between")) {
              element.style.setProperty("justify-content", "space-between", "important");
            }
            if (element.classList.contains("justify-center")) {
              element.style.setProperty("justify-content", "center", "important");
            }
            if (element.classList.contains("gap-2")) {
              element.style.setProperty("gap", "0.5rem", "important");
            }
            if (element.classList.contains("gap-3")) {
              element.style.setProperty("gap", "0.75rem", "important");
            }
          });
        },
      });

      // Canvas를 Blob으로 변환
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error(t("share.toast.imageGenerateFailed"));
          return;
        }

        // 다운로드 링크 생성
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `nasun-leaderboard-${username}-rank${rank}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(t("share.toast.imageDownloaded"));
      }, "image/png");
    } catch (error) {
      console.error("❌ [ShareDropdown] Failed to generate image:", error);
      toast.error(t("share.toast.imageGenerateFailed"));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <Tooltip.Provider>
      <div className="flex items-center justify-between w-full gap-2">
        {/* X/Twitter 공유 */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleShareToTwitter}
              className="flex-1 p-2 rounded-lg bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 flex items-center justify-center"
              aria-label={t("share.shareToTwitter")}
            >
              <img
                src="/X_logo_2023.svg.png"
                alt="X Logo"
                className="w-[18px] h-[18px] object-contain dark:invert"
              />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="px-3 py-1.5 bg-gray-300 text-nasun-black/70 border border-gray-500 rounded-lg shadow-lg"
              sideOffset={5}
            >
              {t("share.shareToTwitter")}
              <Tooltip.Arrow className="fill-gray-300" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        {/* 링크 복사 */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleCopyLink}
              className="flex-1 p-2 rounded-lg bg-green-900/20 hover:bg-green-900/40 text-green-400"
              aria-label={t("share.copyLink")}
            >
              <LinkIcon size={18} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="px-3 py-1.5 bg-gray-300 text-nasun-black/70 border border-gray-500 rounded-lg shadow-lg"
              sideOffset={5}
            >
              {t("share.copyLink")}
              <Tooltip.Arrow className="fill-gray-300" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        {/* 이미지 다운로드 */}
        {captureRef && (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleDownloadImage}
                disabled={isGeneratingImage}
                className="flex-1 p-2 rounded-lg bg-purple-900/20 hover:bg-purple-900/40 text-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t("share.downloadImage")}
              >
                <Download size={18} className={isGeneratingImage ? "animate-pulse" : ""} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="px-3 py-1.5 bg-gray-300 text-nasun-black/70 border border-gray-500 rounded-lg shadow-lg"
                sideOffset={5}
              >
                {isGeneratingImage ? t("share.generatingImage") : t("share.downloadImage")}
                <Tooltip.Arrow className="fill-gray-300" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        )}
      </div>
    </Tooltip.Provider>
  );
};
