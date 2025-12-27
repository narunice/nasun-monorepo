/**
 * 언어 범례 컴포넌트 (ISO 639-1 기반)
 * NASUN UI Design Guide 준수 - 모노톤 미니멀리즘 디자인
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  getAllLanguageCodes,
  getLanguageFlag,
  getLanguageName,
  getLanguageColors,
} from "@/utils/communityLanguage";

interface CommunityLanguageLegendProps {
  /** 범례 표시 여부 */
  show?: boolean;
  /** 컴팩트 모드 여부 */
  compact?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 언어 구분을 설명하는 범례 컴포넌트
 *
 * Features:
 * - 모든 지원 언어의 국기와 이름 표시
 * - 점수 가중치 시스템 설명
 * - NASUN 모노톤 디자인 준수
 * - 접기/펼치기 기능
 * - 반응형 레이아웃
 */
export const CommunityLanguageLegend: React.FC<CommunityLanguageLegendProps> = ({
  show = true,
  compact = false,
  className = "",
}) => {
  const { t, i18n } = useTranslation("leaderboard");
  const currentLocale = i18n.language as "ko" | "en";
  const [isExpanded, setIsExpanded] = useState(!compact);

  const languageCodes = getAllLanguageCodes();

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        bg-gray-800
        border border-gray-700
        rounded-lg overflow-hidden
        ${className}
      `}
    >
      {/* 헤더 */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">
              {t("community.legend.title", "커뮤니티 구분")}
            </span>
            <span className="text-gray-400">{t("community.legend.subtitle", "가중치 시스템")}</span>
          </div>

          {compact && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="
                p-1 rounded-lg
                text-gray-400
                hover:bg-gray-700
              "
              aria-label={isExpanded ? "범례 접기" : "범례 펼치기"}
            >
              <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                ▼
              </motion.div>
            </button>
          )}
        </div>
      </div>

      {/* 콘텐츠 */}
      <AnimatePresence>
        {(isExpanded || !compact) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3">
              {/* 언어별 범례 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {languageCodes.map((code) => {
                  const flag = getLanguageFlag(code);
                  const name = getLanguageName(code, currentLocale);
                  const colors = getLanguageColors(code);

                  // unknown은 범례에서 제외
                  if (code === "unknown") return null;

                  return (
                    <div
                      key={code}
                      className={`
                        flex items-center gap-2 p-2 rounded-lg
                        bg-${colors.background}
                        border border-${colors.primary}/20
                      `}
                    >
                      <span>{flag}</span>
                      <span className={`font-medium text-${colors.text}`}>{name}</span>

                      {/* 가중치 표시 */}
                      {code === "ko" && (
                        <span className="ml-auto px-2 py-0.5 bg-white/10 text-white rounded-lg-full">
                          +20%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 설명 텍스트 */}
              <div className="text-gray-400 leading-relaxed">
                <p className="mb-1">
                  {t(
                    "community.legend.description",
                    "커뮤니티별로 다른 가중치가 적용됩니다. 한국 커뮤니티는 팔로워 수에 따라 추가 보너스를 받습니다."
                  )}
                </p>
                <p>
                  {t(
                    "community.legend.note",
                    "국기 아이콘은 각 사용자의 주요 활동 언어를 나타냅니다."
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/**
 * 간단한 툴팁 스타일의 도움말 컴포넌트
 */
export const CommunityLanguageTooltip: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useTranslation("leaderboard");

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="
          inline-flex items-center gap-1
          text-gray-400
          hover:text-white
        "
        aria-label="커뮤니티 구분 도움말"
      >
        {children}
        <span>ℹ️</span>
      </button>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.2 }}
            className="
              absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2
              bg-white
              text-black
              p-2 rounded-lg shadow-lg
              whitespace-nowrap max-w-xs z-50
              border border-gray-700
            "
          >
            {t("community.tooltip.text", "국기는 사용자의 주요 활동 언어를 표시합니다")}

            {/* 화살표 */}
            <div
              className="
              absolute top-full left-1/2 transform -translate-x-1/2
              border-4 border-transparent border-t-white
            "
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CommunityLanguageLegend;
