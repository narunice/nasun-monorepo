/**
 * Task Verification Card Component
 *
 * @description
 * X 태스크 검증을 위한 카드 컴포넌트
 * - Like/Retweet 검증 (Follow는 X API Basic Plan 미지원으로 제거)
 * - Intent URL로 팔로우 유도 (선택적 권장)
 *
 * @author Claude Code
 * @date 2025-10-25
 * @updated 2025-10-25 - Follow 검증 제거, Intent URL 팔로우 버튼 추가
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBattalionNftVerification } from "../../../../hooks/useBattalionNftVerification";
import type { TaskType, VerificationResult } from "../../../../types/battalion-nft";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";
import { ExternalLink } from "lucide-react";

// 브랜드 아이콘 추가
library.add(fab);

interface TaskVerificationCardProps {
  xUserId: string;
  xUsername: string;
  walletAddress?: string;
  onVerificationSuccess: (result: VerificationResult) => void;
  onReconnectX?: () => void;
}

/**
 * Task Verification Card 컴포넌트
 *
 * @features
 * - 3가지 태스크 표시 (Follow, Like, Retweet)
 * - 태스크 검증 버튼
 * - 검증 중 로딩 스피너
 * - 각 태스크별 완료/미완료 상태 표시
 * - 타겟 트윗 링크
 * - 에러 메시지 표시
 */
export const TaskVerificationCard: React.FC<TaskVerificationCardProps> = ({
  xUserId,
  xUsername,
  walletAddress,
  onVerificationSuccess,
  onReconnectX,
}) => {
  const { t } = useTranslation("battalion-nft");
  const { verify, isLoading, error, data } = useBattalionNftVerification();
  const [hasVerified, setHasVerified] = useState(false);

  const eventTweetId = import.meta.env.VITE_EVENT_TWEET_ID || "";
  const targetTweetUrl = `https://x.com/Nasun_io/status/${eventTweetId}`;

  const handleVerify = async () => {
    try {
      // walletAddress가 있으면 사용 (Step 4 이후), 없으면 xUserId를 임시로 사용 (Step 3)
      // register-user Lambda에서 실제 walletAddress로 업데이트됨
      await verify({
        walletAddress: walletAddress || xUserId, // 지갑 연결 시 실제 주소 사용
        xUserId,
        xUsername,
      });

      setHasVerified(true);

      // 검증 완료 후 결과만 표시하고, 사용자가 "Next Step" 버튼을 클릭할 때까지 대기
      // onVerificationSuccess는 "Next Step" 버튼 클릭 시에만 호출됨 (line 264-270)
    } catch (err) {
      console.error("Verification failed:", err);
    }
  };

  const getTaskIcon = (completed?: boolean): React.ReactElement => {
    if (completed === true) {
      return (
        <svg
          className="w-6 h-6 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }
    if (completed === false) {
      return (
        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      );
    }
    // 아직 검증하지 않음
    return (
      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  };

  // Follow는 X API Basic Plan 미지원으로 제거
  const tasks: Array<{ type: TaskType; label: string }> = [
    { type: "LIKE", label: t("step3.tasks.like") },
    { type: "RETWEET", label: t("step3.tasks.retweet") },
  ];

  const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
  const followIntentUrl = `https://twitter.com/intent/follow?screen_name=${targetAccount}`;

  return (
    <OuterBox color="c5" className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">{t("step3.title")}</h4>
        <p className="mb-6">{t("step3.description")}</p>
      </div>

      {/* User Info */}
      <DividerBox color="c4" className="!py-4">
        <p>
          {t("step5.labels.xAccount")}: <span>@{xUsername}</span>
        </p>
      </DividerBox>

      {/* Tasks List */}
      <div className="space-y-4 !py-4">
        {/* Follow Recommendation (Not Required) */}
        <div className="flex text-nasun-white items-center justify-between p-4 rounded-lg border transition-all bg-nasun-c2/10 border-nasun-c2/40">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-nasun-c1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span>
              {t("step3.tasks.follow", { account: targetAccount })}{" "}
              <span className="text-nasun-c2/80 text-sm">({t("step3.recommended")})</span>
            </span>
          </div>
          <Button variant="outlineC1" size="sm" asChild>
            <a href={followIntentUrl} target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-4 h-4 mr-1" />
              {t("step3.followButton")}
            </a>
          </Button>
        </div>

        {/* Required Tasks */}
        {tasks.map((task) => {
          const taskStatus = hasVerified
            ? data?.tasks.find((t) => t.taskType === task.type)
            : undefined;
          const completed = taskStatus?.completed;

          return (
            <div
              key={task.type}
              className={`
                flex text-nasun-white/80 items-center justify-between p-4 rounded-lg border transition-all
                ${completed === true ? "bg-green-950 border-green-500/40" : ""}
                ${completed === false ? "bg-red-950/20 border-red-800" : ""}
                ${completed === undefined ? "bg-gray-800 border-gray-600" : ""}
              `}
            >
              <div className="flex items-center space-x-3">
                {getTaskIcon(completed)}
                <span>{task.label}</span>
              </div>

              {completed !== undefined && (
                <span
                  className={`
                    px-3 py-1 rounded-full
                    ${completed ? "bg-green-950 text-green-500" : ""}
                    ${!completed ? "bg-red-900 text-red-200" : ""}
                  `}
                >
                  {completed ? t("step3.status.completed") : t("step3.status.incomplete")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Target Tweet Link */}
      <p className="mb-6 md:mb-8 lg:mb-10">
        💡 {t("step3.infoPrefix")}{" "}
        <a
          href={targetTweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-nasun-c4"
        >
          {t("step3.eventPostLink")}
          <ExternalLink className="w-4 h-4 ml-1 inline-block" />
        </a>
      </p>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
          {error.message?.includes("401") || error.code?.includes("401") ? (
            <>
              <p className="text-red-200 mb-3">⚠️ {t("step3.errors.tokenExpired")}</p>
              {onReconnectX && (
                <Button onClick={onReconnectX} variant="outlineC5" size="sm" className="w-full">
                  {t("step3.errors.reconnectX")}
                </Button>
              )}
            </>
          ) : (
            <p className="text-red-200">
              ❌ {error.message || error.code || t("step3.errors.verificationFailed")}
            </p>
          )}
        </div>
      )}

      {/* Success Message */}
      {hasVerified && data?.eligible && (
        <DividerBox color="green" icon="✅" className="!py-4 mb-6">
          <p>{t("step5.allTasksCompleted")}</p>
        </DividerBox>
      )}

      {/* Token Expired Message (from data.message) */}
      {hasVerified && data && !data.eligible && data.message?.includes("401") && (
        <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
          <p className="text-red-200 mb-3">⚠️ {t("step3.errors.tokenExpired")}</p>
          {onReconnectX && (
            <Button onClick={onReconnectX} variant="outlineC5" size="sm" className="w-full">
              {t("step3.errors.reconnectX")}
            </Button>
          )}
        </div>
      )}

      {/* Incomplete Tasks Message (non-401 errors) */}
      {hasVerified && data && !data.eligible && !data.message?.includes("401") && (
        <DividerBox color="c5" icon="⚠️" className="!py-4 mb-6">
          <p>{t("step3.errors.incomplete")}</p>
        </DividerBox>
      )}

      {/* Action Button */}
      {hasVerified && data?.eligible ? (
        // 검증 완료 시 "다음 스텝" 버튼
        <Button
          onClick={() => {
            onVerificationSuccess({
              following: true,
              liked: true,
              retweeted: true,
              allCompleted: true,
              tasks: data.tasks,
            });
          }}
          variant="c5"
          className="flex mx-auto"
          size="lg"
        >
          <span>{t("step3.nextButton")}</span>
          <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </Button>
      ) : (
        // 검증 버튼 (초기 또는 재시도)
        <Button
          onClick={handleVerify}
          disabled={isLoading}
          variant="c5"
          className="flex mx-auto"
          size="lg"
        >
          {isLoading ? (
            <InlineLoading message={t("step3.verifying")} size="md" />
          ) : (
            <span>{hasVerified ? t("step3.retry") : t("step3.button")}</span>
          )}
        </Button>
      )}
    </OuterBox>
  );
};
