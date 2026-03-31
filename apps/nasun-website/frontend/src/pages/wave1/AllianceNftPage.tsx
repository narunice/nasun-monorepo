/**
 * Alliance NFT Minting Landing Page
 *
 * Lightweight page at /wave1/alliance-nft for marketing/sharing.
 * Reuses AllianceMintDialog for the actual minting flow.
 * One NFT per user, 4 images to choose from.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/features/auth";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { AllianceMintDialog } from "@/sections/myAccount/components/AllianceMintDialog";
import {
  ALLIANCE_IMAGES,
  ALLIANCE_PREVIEW_IMAGES,
  ALLIANCE_NAMES,
} from "@/constants/alliance";

import { PageLayout } from "@/components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { Spinner } from "@/components/ui";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import AllianceNftHeroSection from "@/sections/wave1/alliance-nft/AllianceNftHeroSection";

const AllianceNftPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;

  const { isMinted, isLoading, data, wallets, isConfigured } =
    useAllianceMintStatus(cognitoToken);
  const ecosystem = useEcosystemStatus(cognitoToken ?? undefined);
  const allianceIsActive = !!ecosystem.getActivation("alliance");

  const [showMintDialog, setShowMintDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const mintSectionRef = useRef<HTMLDivElement>(null);
  const wasLoggedOut = useRef(!user);

  // Scroll to mint section after Nasun Wallet login (no page reload)
  useEffect(() => {
    if (user && wasLoggedOut.current) {
      wasLoggedOut.current = false;
      mintSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    if (!user) {
      wasLoggedOut.current = true;
    }
  }, [user]);

  // Scroll to mint section after OAuth/zkLogin redirect (page reload with #mint hash).
  // Delay scroll until after layout settles (hero image load + API fetch).
  useEffect(() => {
    if (window.location.hash === "#mint") {
      const timer = setTimeout(() => {
        mintSectionRef.current?.scrollIntoView({ behavior: "smooth" });
        history.replaceState(null, "", window.location.pathname);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConnect = () => {
    localStorage.setItem("auth_return_to", "/wave1/alliance-nft#mint");
    window.dispatchEvent(new Event("nasun:open-login"));
  };

  return (
    <PageLayout className="!pt-0">
      <Helmet>
        <title>Alliance - NASUN</title>
        <meta
          name="description"
          content="Mint your free Nasun Alliance NFT. Choose from 4 unique designs and join the Nasun ecosystem."
        />
        <meta property="og:title" content="Nasun Alliance" />
        <meta
          property="og:description"
          content="Mint your free Alliance NFT and join the Nasun ecosystem."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <AllianceNftHeroSection />

      <SectionLayout
        ref={mintSectionRef}
        className="!max-w-8xl min-h-[80vh] px-6 sm:px-10 lg:px-12 !pt-12 md:!pt-16 lg:!pt-10"
      >
        <h5 className="text-center text-nasun-white max-w-5xl mx-auto -mt-2 mb-4">
          {isMinted ? (
            <>
              You already own an Alliance NFT.
              <br />
              Explore the Nasun ecosystem and earn points.
            </>
          ) : user ? (
            "Pick your character first and start earning ecosystem points."
          ) : (
            "Login/sign up to mint free Alliance NFT."
          )}
        </h5>

        {/* State-based content */}
        <div>
          {/* State 1: Not logged in */}
          {!user && (
            <div className="flex flex-col items-center gap-16 py-8">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-x-8 sm:gap-y-10 lg:gap-x-8 mx-auto">
                {ALLIANCE_PREVIEW_IMAGES.map((url, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <img
                      src={url}
                      alt={ALLIANCE_NAMES[i]}
                      className="aspect-square rounded-sm object-cover border border-gray-700 w-full"
                      loading="lazy"
                    />
                    <h6 className="text-nasun-white/80">{ALLIANCE_NAMES[i]}</h6>
                  </div>
                ))}
              </div>
              <ButtonV3
                variant="gradient"
                size="xl"
                className="!px-12 !py-4 !text-xl !font-medium"
                onClick={handleConnect}
              >
                Login/Sign up to Mint
              </ButtonV3>
            </div>
          )}

          {/* State 2: Logged in but no wallet */}
          {user &&
            !isLoading &&
            wallets.length === 0 &&
            !isMinted &&
            isConfigured && (
              <div className="flex flex-col items-center gap-16 py-8">
                <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                  {ALLIANCE_PREVIEW_IMAGES.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={ALLIANCE_NAMES[i]}
                      className="aspect-square rounded-sm object-cover border border-gray-700 w-full"
                      loading="lazy"
                    />
                  ))}
                </div>
                <p className="text-nasun-white/80 text-sm text-center">
                  Register a Nasun wallet in My Account to mint.
                </p>
                <ButtonV3
                  variant="gradient"
                  size="xl"
                  className="!px-12 !py-4 !text-xl !font-medium"
                  onClick={() => navigate("/my-account")}
                >
                  Go to My Account
                </ButtonV3>
              </div>
            )}

          {/* State 3: Ready to mint */}
          {user &&
            !isLoading &&
            wallets.length > 0 &&
            !isMinted &&
            isConfigured && (
              <div className="flex flex-col items-center gap-16 py-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-x-8 sm:gap-y-10 lg:gap-x-8 mx-auto">
                  {ALLIANCE_PREVIEW_IMAGES.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={selectedImage === i}
                      onClick={() =>
                        setSelectedImage((prev) => (prev === i ? null : i))
                      }
                      className={`flex flex-col items-center gap-2 transition-all ${
                        selectedImage !== null && selectedImage !== i
                          ? "opacity-40"
                          : ""
                      }`}
                    >
                      <div
                        className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all w-full ${
                          selectedImage === i
                            ? "border-nasun-c7 ring-2 ring-nasun-c7/50"
                            : "border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        <img
                          src={url}
                          alt={ALLIANCE_NAMES[i]}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {selectedImage === i && (
                          <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-green-500 shadow-lg shadow-green-500/40 flex items-center justify-center">
                            <span className="text-white text-base font-bold">
                              &#10003;
                            </span>
                          </div>
                        )}
                      </div>
                      <h6
                        className={`transition-colors ${
                          selectedImage === i
                            ? "text-nasun-white"
                            : "text-nasun-white/80 hover:text-nasun-white"
                        }`}
                      >
                        {ALLIANCE_NAMES[i]}
                      </h6>
                    </button>
                  ))}
                </div>
                <ButtonV3
                  variant="c1-gradient"
                  size="xl"
                  className="!px-12 !py-4 !text-xl !font-medium"
                  disabled={selectedImage === null}
                  onClick={() => setShowMintDialog(true)}
                >
                  {selectedImage !== null
                    ? `Mint ${ALLIANCE_NAMES[selectedImage]}`
                    : "Mint Alliance NFT"}
                </ButtonV3>
              </div>
            )}

          {/* State 4: Already minted */}
          {user && !isLoading && isMinted && data && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="relative">
                <img
                  src={ALLIANCE_IMAGES[data.imageIndex] || ALLIANCE_IMAGES[0]}
                  alt="Your Alliance NFT"
                  className="w-48 h-48 rounded-sm object-cover border-2 border-nasun-c7 shadow-lg shadow-nasun-c7/20"
                />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-sm">&#10003;</span>
                </div>
              </div>
              <div className="text-center">
                <h5 className="text-nasun-white font-semibold mb-1">
                  {ALLIANCE_NAMES[data.imageIndex] || "Alliance NFT"}
                </h5>
                <p className="text-nasun-white/50 text-base">
                  Minted to{" "}
                  <span className="font-mono">
                    {data.walletAddress.slice(0, 6)}...
                    {data.walletAddress.slice(-4)}
                  </span>
                </p>
              </div>
              <ButtonV3
                className="mt-4"
                variant="gradient"
                size="xl"
                onClick={() => navigate("/my-account")}
              >
                {allianceIsActive ? "Go to My Account" : "Activate Alliance"}
              </ButtonV3>
              {data.nftObjectId && (
                <a
                  href={`https://explorer.nasun.io/devnet/object/${data.nftObjectId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-nasun-c7 hover:text-nasun-c7/80 text-sm underline underline-offset-2"
                >
                  View on Explorer
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
            </div>
          )}

          {/* Loading */}
          {user && isLoading && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Spinner size="lg" />
              <p className="text-nasun-white/50 text-sm">Loading status...</p>
            </div>
          )}

          {/* API not configured */}
          {user && !isLoading && !isConfigured && (
            <div className="text-center py-8">
              <p className="text-nasun-white/50 text-sm">
                Alliance NFT minting is not available at this time.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 max-w-3xl mx-auto mt-12 text-nasun-white/80">
          <svg
            className="w-4 h-4 mt-0.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-sm">
            This NFT is a devnet asset minted on Nasun Devnet. It exists solely
            for testing and community participation purposes. If the devnet is
            reset, your chosen NFT will be restored automatically, although the
            object ID will change.
          </p>
        </div>
      </SectionLayout>

      {/* Mint Dialog */}
      {cognitoToken && (
        <AllianceMintDialog
          open={showMintDialog}
          onOpenChange={setShowMintDialog}
          wallets={wallets}
          cognitoToken={cognitoToken}
          selectedImage={selectedImage}
        />
      )}
    </PageLayout>
  );
};

export default AllianceNftPage;
