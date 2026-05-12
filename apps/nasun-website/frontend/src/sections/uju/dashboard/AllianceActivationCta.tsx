import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";

// Onboarding CTA shown in the Overview right panel when the user has not yet
// activated the Nasun Points system. Two states:
//   1. Alliance not minted        → "Mint Free Alliance NFT" → /community/alliance-nft
//   2. Alliance minted, inactive  → "Activate Alliance NFT"  → scrolls to #nfts-activated
// Hidden when Alliance or Genesis Pass is already active.

const CTA_CLASSES =
  "inline-block text-sm font-semibold py-2 px-4 rounded-full border border-pado-3/40 text-pado-3 bg-pado-3/10 hover:bg-pado-3/20 transition-colors whitespace-nowrap";

function scrollToNftsActivated() {
  document
    .getElementById("nfts-activated")
    ?.scrollIntoView({ behavior: "smooth" });
}

export function AllianceActivationCta() {
  const { user } = useAuth();
  const { getActivation, isLoading: statusLoading } = useEcosystemStatus(
    user?.cognitoToken,
    user?.identityId,
  );
  const { isMinted, isLoading: mintLoading } = useAllianceMintStatus(
    user?.cognitoToken,
  );

  if (!user?.cognitoToken) return null;
  if (statusLoading || mintLoading) return null;

  const allianceActive = !!getActivation("alliance");
  const genesisActive = !!getActivation("genesis-pass");
  if (allianceActive || genesisActive) return null;

  const notMinted = !isMinted;
  const headline = notMinted
    ? "Activate your Nasun Points"
    : "One step to go";
  const subCopy = notMinted
    ? "Mint free Alliance NFT to activate point system and health. Your daily activity will start earning points."
    : "Activate your Alliance NFT to unlock the point system and start your health streak.";
  const accentBorder = notMinted
    ? "border-l-emerald-400"
    : "border-l-amber-400";

  const cta = notMinted ? (
    <Link to="/community/alliance-nft" className={CTA_CLASSES}>
      Mint Free Alliance NFT →
    </Link>
  ) : (
    <button type="button" onClick={scrollToNftsActivated} className={CTA_CLASSES}>
      Activate Alliance NFT →
    </button>
  );

  return (
    <div
      className={`mb-5 sm:mb-6 rounded-xl bg-pado-2/[0.18] border-l-2 ${accentBorder} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4`}
    >
      <div className="min-w-0">
        <p className="text-base font-semibold text-uju-primary leading-tight">
          {headline}
        </p>
        <p className="mt-1 text-sm text-uju-secondary leading-snug">
          {subCopy}
        </p>
      </div>
      <div className="shrink-0">{cta}</div>
    </div>
  );
}
