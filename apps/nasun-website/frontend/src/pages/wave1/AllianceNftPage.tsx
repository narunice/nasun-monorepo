/**
 * Alliance NFT Minting Landing Page
 *
 * Lightweight page at /wave1/alliance-nft for marketing/sharing.
 * Reuses AllianceMintDialog for the actual minting flow.
 * One NFT per user, 4 images to choose from.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/features/auth";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { AllianceMintDialog } from "@/sections/myAccount/components/AllianceMintDialog";
import { ALLIANCE_IMAGES } from "@/constants/alliance";

const ALLIANCE_NAMES = [
  "The Strategist",
  "The Explorer",
  "The Guardian",
  "The Artisan",
];
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { ButtonV3 } from "@/components/ui/button-v3";
import { Spinner } from "@/components/ui";

const AllianceNftPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;

  const { isMinted, isLoading, data, wallets, isConfigured } =
    useAllianceMintStatus(cognitoToken);

  const [showMintDialog, setShowMintDialog] = useState(false);

  const handleConnect = () => {
    window.dispatchEvent(new Event("nasun:open-login"));
  };

  return (
    <PageLayout>
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

      <SectionLayout className="!max-w-7xl px-6 sm:px-10 lg:px-12">
        <PageTitle>ALLIANCE</PageTitle>

        <p className="text-center text-nasun-white/70 text-lg max-w-xl mx-auto -mt-2 mb-4">
          {isMinted
            ? <>You already own an Alliance NFT.<br />Explore the Nasun ecosystem and earn points.</>
            : "Pick your character, join Nasun, and start earning ecosystem points."}
        </p>

        {/* State-based content */}
        <div>
          {/* State 1: Not logged in */}
          {!user && (
            <div className="flex flex-col items-center gap-12 py-8">
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 sm:gap-x-8 sm:gap-y-10 lg:gap-x-8 mx-auto">
                  {ALLIANCE_IMAGES.map((url, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <img
                        src={url}
                        alt={ALLIANCE_NAMES[i]}
                        className="aspect-square rounded-xl object-cover border border-gray-700 w-full"
                        loading="lazy"
                      />
                      <h6 className="text-nasun-white/50">
                        {ALLIANCE_NAMES[i]}
                      </h6>
                    </div>
                  ))}
                </div>
              </div>
              <ButtonV3 variant="gradient" size="xl" onClick={handleConnect}>
                Login/Sign up to Mint
              </ButtonV3>
            </div>
          )}

          {/* State 2: Logged in but no wallet registered */}
          {user &&
            !isLoading &&
            wallets.length === 0 &&
            !isMinted &&
            isConfigured && (
              <div className="flex flex-col items-center gap-12 py-8">
                <div>
                  <p className="text-center text-nasun-white/80 text-sm mb-5">
                    Pick your character, join Nasun, and start earning points.
                  </p>
                  <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                    {ALLIANCE_IMAGES.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Alliance #${i + 1}`}
                        className="aspect-square rounded-xl object-cover border border-gray-700 w-full"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
                <p className="text-nasun-white/60 text-sm text-center">
                  Register a Nasun wallet in My Account to mint.
                </p>
                <ButtonV3
                  variant="nw2"
                  size="md"
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
              <div className="flex flex-col items-center gap-12 py-8">
                <div>
                  <p className="text-center text-nasun-white/80 text-sm mb-5">
                    Pick your character and start earning points.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 sm:gap-x-8 sm:gap-y-10 lg:gap-x-8 mx-auto">
                    {ALLIANCE_IMAGES.map((url, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-2 cursor-pointer group"
                      >
                        <img
                          src={url}
                          alt={ALLIANCE_NAMES[i]}
                          className="aspect-square rounded-xl object-cover border border-gray-700 group-hover:border-nasun-c7 transition-colors w-full"
                          loading="lazy"
                        />
                        <h6 className="text-nasun-white/50 group-hover:text-nasun-white/70 transition-colors">
                          {ALLIANCE_NAMES[i]}
                        </h6>
                      </div>
                    ))}
                  </div>
                </div>
                <ButtonV3
                  variant="nw2"
                  size="md"
                  onClick={() => setShowMintDialog(true)}
                >
                  Mint Alliance NFT
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
                  className="w-48 h-48 rounded-xl object-cover border-2 border-nasun-c7 shadow-lg shadow-nasun-c7/20"
                />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-sm">&#10003;</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-nasun-white font-medium text-lg mb-1">
                  Alliance NFT Minted
                </p>
                <p className="text-nasun-white/50 text-sm">
                  Minted to{" "}
                  <span className="font-mono">
                    {data.walletAddress.slice(0, 6)}...
                    {data.walletAddress.slice(-4)}
                  </span>
                </p>
              </div>
              <ButtonV3 variant="gradient" size="md" onClick={() => navigate("/my-account")}>
                Activate Alliance in My Account
              </ButtonV3>
              {data.nftObjectId && (
                <a
                  href={`https://explorer.nasun.io/devnet/object/${data.nftObjectId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-nasun-c7 hover:text-nasun-c7/80 text-sm underline underline-offset-2"
                >
                  View on Explorer
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      </SectionLayout>

      {/* Mint Dialog */}
      {cognitoToken && (
        <AllianceMintDialog
          open={showMintDialog}
          onOpenChange={setShowMintDialog}
          wallets={wallets}
          cognitoToken={cognitoToken}
        />
      )}
    </PageLayout>
  );
};

export default AllianceNftPage;
