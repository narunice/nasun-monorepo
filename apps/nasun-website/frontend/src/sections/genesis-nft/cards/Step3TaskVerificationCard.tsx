/**
 * Task Verification Card Component
 *
 * @description
 * X 태스크 검증을 위한 카드 컴포넌트
 */

import React, { useState, useEffect, useCallback } from "react";
import { useGenesisNftVerification } from "../../../hooks/useGenesisNftVerification";
import type { TaskType, VerificationResult } from "../../../types/genesis-nft";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";
import { ExternalLink } from "lucide-react";

library.add(fab);

interface TaskVerificationCardProps {
  xUserId: string;
  xUsername: string;
  walletAddress?: string;
  onVerificationSuccess: (result: VerificationResult) => void;
  onReconnectX?: () => void;
}

export const TaskVerificationCard: React.FC<TaskVerificationCardProps> = ({
  xUserId,
  xUsername,
  walletAddress,
  onVerificationSuccess,
  onReconnectX,
}) => {
  const { verify, isLoading, error, data } = useGenesisNftVerification();
  const [hasVerified, setHasVerified] = useState(false);

  const COOLDOWN_KEY = "genesis_nft_verify_cooldown";
  const COOLDOWN_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const getCooldownEnd = useCallback(() => {
    const stored = sessionStorage.getItem(COOLDOWN_KEY);
    return stored ? parseInt(stored, 10) : 0;
  }, []);

  useEffect(() => {
    const updateRemaining = () => {
      const end = getCooldownEnd();
      const remaining = Math.max(0, end - Date.now());
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        sessionStorage.removeItem(COOLDOWN_KEY);
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [getCooldownEnd]);

  const startCooldown = useCallback(() => {
    const end = Date.now() + COOLDOWN_DURATION_MS;
    sessionStorage.setItem(COOLDOWN_KEY, end.toString());
    setCooldownRemaining(COOLDOWN_DURATION_MS);
  }, [COOLDOWN_DURATION_MS]);

  useEffect(() => {
    if (error && (error.code?.includes("429") || error.message?.includes("RATE_LIMIT"))) {
      const end = getCooldownEnd();
      if (end <= Date.now()) {
        startCooldown();
      }
    }
  }, [error, getCooldownEnd, startCooldown]);

  const isCooldownActive = cooldownRemaining > 0;
  const cooldownMinutes = Math.floor(cooldownRemaining / 60000);
  const cooldownSeconds = Math.floor((cooldownRemaining % 60000) / 1000);

  const eventTweetId = import.meta.env.VITE_EVENT_TWEET_ID || "";
  const targetTweetUrl = `https://x.com/Nasun_io/status/${eventTweetId}`;

  const handleVerify = async () => {
    if (isCooldownActive) return;

    try {
      await verify({
        walletAddress: walletAddress || xUserId,
        xUserId,
        xUsername,
      });

      setHasVerified(true);
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code?.includes("429") || apiError.message?.includes("RATE_LIMIT")) {
        startCooldown();
      }
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

  const tasks: Array<{ type: TaskType; label: string }> = [
    { type: "LIKE", label: "Like any @Nasun_io post" },
    { type: "REPOST", label: "Repost any @Nasun_io post" },
  ];

  const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
  const followIntentUrl = `https://twitter.com/intent/follow?screen_name=${targetAccount}`;

  const formatCooldown = `${cooldownMinutes}:${cooldownSeconds.toString().padStart(2, "0")}`;

  return (
    <OuterBox color="nw0" className=" max-w-3xl mx-auto">
      <div className="text-center">
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">Verify Event Tasks</h4>
        <p className="mb-6">Verify that you have completed all the tasks below.</p>
      </div>

      <div className="flex items-center justify-between p-4 rounded-md border border-gray-600 bg-gray-900/50">
        <div className="flex items-center space-x-3">
          <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-5 h-5 text-nasun-white" />
          <span className=" text-nasun-white ">@{xUsername}</span>
        </div>
      </div>

      <div className="space-y-4 !py-4">
        {/* Follow Recommendation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-md border border-gray-600 bg-gray-900/50">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-nasun-nw4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className=" text-nasun-white">
              {`Follow @${targetAccount}`}{" "}
              <span className="text-nasun-nw4/80">(Recommended)</span>
            </span>
          </div>
          <ButtonV3 variant="nw4" outline size="sm" className="w-full sm:w-auto" asChild>
            <a href={followIntentUrl} target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-4 h-4 mr-1" />
              Follow
            </a>
          </ButtonV3>
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
                flex text-nasun-white items-center justify-between px-4 py-3 rounded-md border
                ${completed === true ? "bg-green-950 border-green-500/40" : ""}
                ${completed === false ? "bg-red-950/20 border-red-800" : ""}
                ${completed === undefined ? "bg-gray-900/50 border-gray-600" : ""}
              `}
            >
              <div className="flex items-center space-x-3">
                {getTaskIcon(completed)}
                <span className="">{task.label}</span>
              </div>

              {completed !== undefined && (
                <span
                  className={`
                    px-3 py-1 rounded-full
                    ${completed ? "bg-green-950 text-green-500" : ""}
                    ${!completed ? "bg-red-900 text-red-200" : ""}
                  `}
                >
                  {completed ? "Completed" : "Incomplete"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mb-6 md:mb-8 lg:mb-10">
        {"💡 Haven't completed tasks? "}
        <a
          href={targetTweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-nasun-nw1"
        >
          Visit our featured post!
          <ExternalLink className="w-4 h-4 ml-1 inline-block" />
        </a>
      </p>

      {isCooldownActive && (
        <div className="mb-6 p-4 bg-yellow-900/20 rounded-lg border border-yellow-700">
          <p className="text-yellow-200">
            {`X API rate limit reached. Please wait ${formatCooldown} before retrying.`}
          </p>
        </div>
      )}

      {error && !isCooldownActive && (
        <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
          {error.message?.includes("401") || error.code?.includes("401") ? (
            <>
              <p className="text-red-200 mb-3">{"⚠️ Your X authentication has expired. Please reconnect your X account."}</p>
              {onReconnectX && (
                <ButtonV3 onClick={onReconnectX} variant="nw1" outline size="sm" className="w-full">
                  Reconnect X Account
                </ButtonV3>
              )}
            </>
          ) : (
            <p className="text-red-200">
              {"❌ "}{error.message || error.code || "Task verification failed"}
            </p>
          )}
        </div>
      )}

      {hasVerified && data?.eligible && (
        <DividerBox color="green" icon="✅" className="!py-4 mb-6">
          <p>{"\u2705 All tasks verified"}</p>
        </DividerBox>
      )}

      {hasVerified && data && !data.eligible && data.message?.includes("401") && (
        <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
          <p className="text-red-200 mb-3">{"⚠️ Your X authentication has expired. Please reconnect your X account."}</p>
          {onReconnectX && (
            <ButtonV3 onClick={onReconnectX} variant="nw1" outline size="sm" className="w-full">
              Reconnect X Account
            </ButtonV3>
          )}
        </div>
      )}

      {hasVerified && data && !data.eligible && !data.message?.includes("401") && (
        <DividerBox color="nw1" icon="⚠️" className="!py-4 mb-6">
          <p>Some tasks are incomplete. Please complete all tasks and try again.</p>
        </DividerBox>
      )}

      {hasVerified && data?.eligible ? (
        <ButtonV3
          onClick={() => {
            onVerificationSuccess({
              following: true,
              liked: true,
              reposted: true,
              allCompleted: true,
              tasks: data.tasks,
            });
          }}
          variant="nw1"
          className="flex mx-auto"
          size="lg"
        >
          <span>Next Step</span>
          <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </ButtonV3>
      ) : (
        <ButtonV3
          onClick={handleVerify}
          disabled={isLoading || isCooldownActive}
          variant="nw1"
          className="flex mx-auto"
          size="lg"
        >
          {isLoading ? (
            <InlineLoading message="Verifying..." size="md" />
          ) : isCooldownActive ? (
            <span>{`Retry in ${formatCooldown}`}</span>
          ) : (
            <span>{hasVerified ? "Retry Verification" : "Verify Tasks"}</span>
          )}
        </ButtonV3>
      )}
    </OuterBox>
  );
};
