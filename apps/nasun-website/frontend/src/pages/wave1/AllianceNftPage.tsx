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
import { ALLIANCE_IMAGES, EXPLORER_TX_URL } from "@/constants/alliance";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
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
        <title>Alliance NFT - NASUN</title>
        <meta
          name="description"
          content="Mint your free Nasun Alliance NFT. Choose from 4 unique designs and join the Nasun ecosystem."
        />
        <meta property="og:title" content="Nasun Alliance NFT" />
        <meta
          property="og:description"
          content="Mint your free Alliance NFT and join the Nasun ecosystem."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <SectionLayout className="!max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-nasun-white mb-4 tracking-tight">
            ALLIANCE NFT
          </h1>
          <p className="text-nasun-white/70 text-lg max-w-xl mx-auto">
            Your entry to the Nasun ecosystem. Mint a free Alliance NFT to start
            earning ecosystem points and climb the leaderboard.
          </p>
        </div>

        {/* State-based content */}
        <div className="bg-gray-900/50 border border-nasun-c5/20 rounded-xl p-6 md:p-8">
          {/* State 1: Not logged in */}
          {!user && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="grid grid-cols-2 gap-3 max-w-xs">
                {ALLIANCE_IMAGES.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Alliance #${i + 1}`}
                    className="aspect-square rounded-lg object-cover border border-gray-700"
                    loading="lazy"
                  />
                ))}
              </div>
              <p className="text-nasun-white/60 text-sm text-center">
                Connect your account to mint your Alliance NFT.
              </p>
              <ButtonV3 variant="nw2" size="md" onClick={handleConnect}>
                Connect to Mint
              </ButtonV3>
            </div>
          )}

          {/* State 2: Logged in but no wallet registered */}
          {user && !isLoading && wallets.length === 0 && !isMinted && isConfigured && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="grid grid-cols-2 gap-3 max-w-xs">
                {ALLIANCE_IMAGES.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Alliance #${i + 1}`}
                    className="aspect-square rounded-lg object-cover border border-gray-700"
                    loading="lazy"
                  />
                ))}
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
          {user && !isLoading && wallets.length > 0 && !isMinted && isConfigured && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="grid grid-cols-2 gap-3 max-w-xs">
                {ALLIANCE_IMAGES.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Alliance #${i + 1}`}
                    className="aspect-square rounded-lg object-cover border border-gray-700 hover:border-nasun-c7 transition-colors"
                    loading="lazy"
                  />
                ))}
              </div>
              <p className="text-nasun-white/60 text-sm text-center">
                Choose an image and mint your Alliance NFT. One per account.
              </p>
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
                    {data.walletAddress.slice(0, 6)}...{data.walletAddress.slice(-4)}
                  </span>
                </p>
              </div>
              {data.txDigest && (
                <a
                  href={`${EXPLORER_TX_URL}/${data.txDigest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c7 hover:text-nasun-c7/80 text-sm underline underline-offset-2"
                >
                  View on Explorer
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
