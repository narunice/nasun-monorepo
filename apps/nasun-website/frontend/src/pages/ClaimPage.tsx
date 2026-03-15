/**
 * Claim Page - Standalone landing page for Nasun Link claims
 *
 * Decodes LinkData from the URL path, verifies HMAC integrity,
 * and renders the LinkClaimPage component from @nasun/wallet-ui.
 *
 * No Navbar/Footer - this is a minimal, focused claim experience.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { decodeClaimPayload, getExplorerTxUrl } from "@nasun/wallet";
import type { LinkData } from "@nasun/wallet";
import { LinkClaimPage } from "@nasun/wallet-ui";

const CLAIM_SECRET_KEY = "nasun:claim:secret";
const CLAIM_RETURN_URL_KEY = "nasun:claim:returnUrl";

/** Resolve secret: hash fragment first, then sessionStorage fallback */
function resolveSecret(): string {
  const hash = window.location.hash.slice(1);
  if (hash) return hash;
  const saved = sessionStorage.getItem(CLAIM_SECRET_KEY);
  if (saved) {
    sessionStorage.removeItem(CLAIM_SECRET_KEY);
    sessionStorage.removeItem(CLAIM_RETURN_URL_KEY);
    return saved;
  }
  return "";
}

const ClaimPage = () => {
  const { encodedData } = useParams<{ encodedData: string }>();
  const navigate = useNavigate();

  // Resolve secret once on mount (hash fragment or sessionStorage after OAuth redirect)
  const secretRef = useRef(resolveSecret());

  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<{
    txDigest: string;
    amount: bigint;
  } | null>(null);

  // Decode and verify HMAC on mount
  useEffect(() => {
    if (!encodedData || !secretRef.current) {
      setError(
        !encodedData
          ? "Invalid link format."
          : "Missing claim secret. The link may be incomplete."
      );
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await decodeClaimPayload(encodedData, secretRef.current);
        if (!cancelled) {
          setLinkData(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to decode link data."
          );
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [encodedData]);

  // Capture successful claim for post-claim CTA
  const handleSuccess = useCallback((txDigest: string, amount: bigint) => {
    setClaimSuccess({ txDigest, amount });
  }, []);

  // Persist secret before zkLogin OAuth redirect
  const handleBeforeZkLogin = useCallback(() => {
    if (secretRef.current) {
      sessionStorage.setItem(CLAIM_SECRET_KEY, secretRef.current);
      sessionStorage.setItem(CLAIM_RETURN_URL_KEY, window.location.pathname);
    }
  }, []);

  // Reconstruct linkUrl for the LinkClaimPage component
  const linkUrl = encodedData
    ? `${window.location.origin}/claim/${encodedData}#${secretRef.current}`
    : window.location.href;

  return (
    <div className="min-h-screen bg-nasun-black flex flex-col items-center justify-center px-4 py-8">
      {/* Nasun logo */}
      <div className="mb-8">
        <img
          src="/nasun_symbol_black.svg"
          alt="NASUN"
          className="h-10 w-10 invert opacity-80"
        />
      </div>

      {/* Claim card */}
      {/* onClickCapture ensures secret is saved before any child stopPropagation */}
      <div
        className="w-full max-w-md bg-zinc-900/80 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-zinc-800"
        onClickCapture={handleBeforeZkLogin}
        role="presentation"
      >
        <LinkClaimPage
          linkUrl={linkUrl}
          linkData={linkData}
          isLoadingLinkData={isLoading}
          linkDataError={error}
          onSuccess={handleSuccess}
        />
      </div>

      {/* Post-claim CTA */}
      {claimSuccess && (
        <div className="w-full max-w-md mt-6 space-y-3">
          <p className="text-sm text-zinc-500 text-center">What's next?</p>

          <button
            onClick={() => navigate("/")}
            className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            Go to Nasun
          </button>

          <a
            href={getExplorerTxUrl(claimSuccess.txDigest)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            View transaction on Explorer ↗
          </a>
        </div>
      )}

      {/* Footer branding */}
      <p className="mt-8 text-xs text-zinc-600">Powered by Nasun</p>
    </div>
  );
};

export default ClaimPage;
