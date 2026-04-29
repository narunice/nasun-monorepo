/**
 * useUjuTelegramVerify Hook
 *
 * Handles Telegram Login Widget integration and channel membership verification.
 * Detached from myAccount dependencies.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import logger from "@/lib/logger";
import type { UserData } from "@/store/userStore";
import { VOTING_POWER_QUERY_KEY } from "@/features/governance/hooks/useVotingPower";

// Telegram Login Widget types
interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    Telegram?: {
      Login: {
        auth: (
          options: { bot_id: string; request_access?: boolean },
          callback: (data: TelegramAuthData | false) => void,
        ) => void;
      };
    };
  }
}

interface UseUjuTelegramVerifyProps {
  user: UserData | null;
}

interface UseUjuTelegramVerifyResult {
  isLoading: boolean;
  isVerifying: boolean;
  isDisconnecting: boolean;
  isVerified: boolean;
  telegramUsername: string | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;
const TELEGRAM_BOT_ID = import.meta.env.VITE_TELEGRAM_BOT_ID;

let widgetScriptLoaded = false;
let widgetScriptLoading = false;

function loadTelegramWidget(): Promise<void> {
  if (widgetScriptLoaded) return Promise.resolve();
  if (widgetScriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (widgetScriptLoaded) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  widgetScriptLoading = true;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.onload = () => {
      widgetScriptLoaded = true;
      widgetScriptLoading = false;
      resolve();
    };
    script.onerror = () => {
      widgetScriptLoading = false;
      reject(new Error("Failed to load Telegram widget script"));
    };
    document.head.appendChild(script);
  });
}

export const useUjuTelegramVerify = ({ user }: UseUjuTelegramVerifyProps): UseUjuTelegramVerifyResult => {
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.cognitoToken || !LEADERBOARD_V3_API_URL) {
      setIsLoading(false);
      return;
    }

    abortRef.current = false;

    const checkStatus = async () => {
      try {
        const response = await fetch(
          `${LEADERBOARD_V3_API_URL}/v3/leaderboard/telegram-status`,
          {
            headers: {
              Authorization: `Bearer ${user.cognitoToken}`,
            },
          },
        );
        if (!response.ok) {
          setIsLoading(false);
          return;
        }
        const data = await response.json();
        if (abortRef.current) return;

        if (data.isTelegramMember) {
          setIsVerified(true);
          setTelegramUsername(data.telegramUsername || null);
        }
      } catch (err) {
        logger.error("Failed to check Telegram verification status:", err);
      } finally {
        if (!abortRef.current) setIsLoading(false);
      }
    };

    checkStatus();

    return () => {
      abortRef.current = true;
    };
  }, [user?.cognitoToken]);

  useEffect(() => {
    if (TELEGRAM_BOT_ID) {
      loadTelegramWidget().catch((err) => {
        logger.error("Telegram widget load error:", err);
      });
    }
  }, []);

  const connect = useCallback(() => {
    if (!TELEGRAM_BOT_ID) {
      toast.error("Telegram bot is not configured.");
      return;
    }

    if (!user?.cognitoToken) {
      toast.error("Please sign in first.");
      return;
    }

    if (!window.Telegram?.Login) {
      toast.error("Telegram widget not loaded. Please refresh and try again.");
      return;
    }

    window.Telegram.Login.auth(
      { bot_id: TELEGRAM_BOT_ID, request_access: true },
      async (authData: TelegramAuthData | false) => {
        if (!authData) return;

        setIsVerifying(true);
        setError(null);

        try {
          const response = await fetch(
            `${LEADERBOARD_V3_API_URL}/v3/leaderboard/verify-telegram`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${user.cognitoToken}`,
              },
              body: JSON.stringify({ telegramAuth: authData }),
            },
          );

          const result = await response.json();

          if (!response.ok) {
            const errorMessage = result.message || result.error || "Verification failed";

            if (response.status === 400 && result.error === "Not a channel member") {
              const channelUsername = result.channelUsername;
              toast.error(
                <div>
                  <p>Please join our Telegram channel first, then try again.</p>
                  {channelUsername && (
                    <a
                      href={`https://t.me/${channelUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pado-2 underline mt-1 block"
                    >
                      Join @{channelUsername}
                    </a>
                  )}
                </div>,
                { autoClose: 8000 },
              );
            } else if (response.status === 401) {
              toast.error("Session expired. Please sign out and sign in again.");
            } else if (response.status === 409) {
              toast.error("This Telegram account is already linked to another leaderboard account.");
            } else if (response.status === 503) {
              toast.error("Telegram verification is temporarily unavailable. Please try again later.");
            } else {
              toast.error(errorMessage);
            }

            setError(errorMessage);
            return;
          }

          setIsVerified(true);
          setTelegramUsername(result.telegramUsername || authData.username || null);
          queryClient.invalidateQueries({ queryKey: [VOTING_POWER_QUERY_KEY] });
          toast.success("Telegram channel membership verified!");
        } catch (err) {
          logger.error("Telegram verification error:", err);
          const message = err instanceof Error ? err.message : "Verification failed";
          setError(message);
          toast.error("Failed to verify Telegram membership. Please try again.");
        } finally {
          setIsVerifying(false);
        }
      },
    );
  }, [user?.cognitoToken, queryClient]);

  const disconnect = useCallback(async () => {
    if (!confirm("Disconnect Telegram account?")) return;

    if (!user?.cognitoToken || !LEADERBOARD_V3_API_URL) {
      toast.error("Please sign in first.");
      return;
    }

    setIsDisconnecting(true);
    setError(null);

    try {
      const response = await fetch(
        `${LEADERBOARD_V3_API_URL}/v3/leaderboard/disconnect-telegram`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user.cognitoToken}`,
          },
        },
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to disconnect");
      }

      setIsVerified(false);
      setTelegramUsername(null);
      queryClient.invalidateQueries({ queryKey: [VOTING_POWER_QUERY_KEY] });
      toast.success("Telegram account disconnected.");
    } catch (err) {
      logger.error("Telegram disconnect error:", err);
      const message = err instanceof Error ? err.message : "Failed to disconnect";
      setError(message);
      toast.error("Failed to disconnect Telegram. Please try again.");
    } finally {
      setIsDisconnecting(false);
    }
  }, [user?.cognitoToken, queryClient]);

  return {
    isLoading,
    isVerifying,
    isDisconnecting,
    isVerified,
    telegramUsername,
    error,
    connect,
    disconnect,
  };
};
