/**
 * useReferralCapture Hook
 *
 * Captures ?ref=CODE from URL and stores in localStorage with 7-day TTL.
 * After login, automatically applies the referral code.
 *
 * Mount this hook once at the app level (e.g., App.tsx or MyAccountPage).
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth";
import { applyReferralCode } from "@/services/referralApi";

const STORAGE_KEY = "nasun_referral_code";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredReferral {
  code: string;
  capturedAt: number;
}

function getStoredReferral(): StoredReferral | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredReferral = JSON.parse(raw);
    if (Date.now() - parsed.capturedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function storeReferral(code: string): void {
  const data: StoredReferral = { code, capturedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useReferralCapture(): void {
  const { user } = useAuth();
  const appliedRef = useRef(false);

  // Step 1: Capture ?ref=CODE from URL on any page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode && (refCode.length === 6 || refCode.length === 8)) {
      storeReferral(refCode.toUpperCase());
      // Clean URL without triggering navigation
      params.delete("ref");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Step 2: Auto-apply after login
  useEffect(() => {
    if (!user?.cognitoToken || appliedRef.current) return;

    const stored = getStoredReferral();
    if (!stored) return;

    appliedRef.current = true;

    applyReferralCode(user.cognitoToken, stored.code)
      .then(() => {
        console.log(`[referral] Applied code ${stored.code}`);
        localStorage.removeItem(STORAGE_KEY);
      })
      .catch((err) => {
        // Terminal error codes: drop the stored code so we stop retrying.
        // ALREADY_APPLIED — already attached.
        // SELF_REFERRAL   — won't ever succeed for this user.
        // RECENTLY_DECLINED — under 30-day cooldown after admin decline.
        // CODE_NOT_FOUND  — bad code in URL; no point retrying.
        if (
          err.errorCode === "ALREADY_APPLIED" ||
          err.errorCode === "SELF_REFERRAL" ||
          err.errorCode === "RECENTLY_DECLINED" ||
          err.errorCode === "CODE_NOT_FOUND"
        ) {
          localStorage.removeItem(STORAGE_KEY);
        }
        // Other errors: keep in storage for retry on next login
        console.warn("[referral] Auto-apply failed:", err.message);
        appliedRef.current = false;
      });
  }, [user?.cognitoToken]);
}
