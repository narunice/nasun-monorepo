/**
 * AllianceMintDialog Component
 *
 * Confirmation dialog: shows selected image + wallet, then minting result.
 * Image selection happens on the page, not in this dialog.
 * Server-side minting via governance-api Lambda.
 */

import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { mintAllianceNft, type AllianceWallet } from "@/services/allianceNftApi";
import { invalidateAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { Spinner } from "@/components/ui";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EXPLORER_TX_URL, ALLIANCE_PREVIEW_IMAGES, ALLIANCE_NAMES } from "@/constants/alliance";

interface AllianceMintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: AllianceWallet[];
  cognitoToken: string;
  selectedImage: number | null;
}

type MintState = "ready" | "minting" | "success" | "error";

const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const AllianceMintDialog: FC<AllianceMintDialogProps> = ({
  open,
  onOpenChange,
  wallets,
  cognitoToken,
  selectedImage,
}) => {
  const navigate = useNavigate();
  const [selectedWallet, setSelectedWallet] = useState(0);
  const [mintState, setMintState] = useState<MintState>("ready");
  const [result, setResult] = useState<{ txDigest: string; nftObjectId: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const resetState = () => {
    setSelectedWallet(0);
    setMintState("ready");
    setResult(null);
    setErrorMessage("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const handleMint = async () => {
    if (selectedImage === null || selectedImage < 0 || selectedImage > 3) return;

    setMintState("minting");
    setErrorMessage("");

    try {
      const res = await mintAllianceNft(cognitoToken, selectedImage, selectedWallet);
      if (res.success && res.data) {
        setResult(res.data);
        setMintState("success");
        invalidateAllianceMintStatus();
        toast.success("Alliance NFT minted!");
      } else {
        throw new Error(res.error || "Mint failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mint";
      setErrorMessage(message);
      setMintState("error");
    }
  };

  const handleRetry = () => {
    setMintState("ready");
    setErrorMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-gray-900 border-nasun-c5/30">
        <DialogHeader>
          <DialogTitle asChild>
            <h4 className="text-nasun-white text-xl font-semibold">
              {mintState === "success" ? "NFT Minted!" : "Confirm Mint"}
            </h4>
          </DialogTitle>
          {mintState === "ready" && (
            <DialogDescription className="text-nasun-white/80 text-sm mt-1">
              Mint this character as your Alliance NFT?
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Confirmation: show selected image + wallet */}
        {mintState === "ready" && selectedImage !== null && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative w-48 h-48">
              <img
                src={ALLIANCE_PREVIEW_IMAGES[selectedImage]}
                alt={ALLIANCE_NAMES[selectedImage]}
                className="w-full h-full rounded-sm object-cover border-2 border-nasun-c7 ring-2 ring-nasun-c7/50"
              />
              <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-nasun-c7 flex items-center justify-center">
                <span className="text-white text-sm">&#10003;</span>
              </div>
            </div>
            <h6 className="text-nasun-white font-medium text-lg">
              {ALLIANCE_NAMES[selectedImage]}
            </h6>

            {/* Wallet selector */}
            {wallets.length > 1 && (
              <div className="flex flex-col gap-1 w-full">
                <label className="text-nasun-white/80 text-sm">Mint to wallet</label>
                <select
                  value={selectedWallet}
                  onChange={(e) => setSelectedWallet(Number(e.target.value))}
                  className="bg-gray-800 text-nasun-white border border-gray-700 rounded-md px-3 py-2 text-sm"
                >
                  {wallets.map((w) => (
                    <option key={w.walletAddress} value={w.index}>
                      {shortenAddress(w.walletAddress)}{w.label ? ` (${w.label})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {wallets.length === 1 && (
              <p className="text-nasun-white/80 text-sm">
                Mint to: <span className="font-mono">{shortenAddress(wallets[0].walletAddress)}</span>
              </p>
            )}

            <ButtonV3
              variant="c1-gradient"
              size="lg"
              onClick={handleMint}
              className="w-full !py-3 !text-lg !font-semibold"
            >
              Confirm Mint
            </ButtonV3>
          </div>
        )}

        {/* Minting in progress */}
        {mintState === "minting" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-nasun-white/70">Minting your Alliance NFT...</p>
          </div>
        )}

        {/* Success */}
        {mintState === "success" && result && (
          <div className="flex flex-col items-center gap-4 py-4">
            {selectedImage !== null && (
              <img
                src={ALLIANCE_PREVIEW_IMAGES[selectedImage]}
                alt={ALLIANCE_NAMES[selectedImage]}
                className="w-24 h-24 rounded-sm object-cover border-2 border-green-500/50"
              />
            )}
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 text-2xl">&#10003;</span>
            </div>
            <p className="text-nasun-white text-center">
              Your Alliance NFT has been minted successfully!
            </p>
            <p className="text-nasun-white text-center">
              Activate your Alliance NFT
            </p>
            <ButtonV3
              variant="c1-gradient"
              size="md"
              className="!font-semibold"
              onClick={() => {
                handleOpenChange(false);
                navigate("/my-account");
              }}
            >
              Go to My Account Page
            </ButtonV3>
            <a
              href={`https://explorer.nasun.io/devnet/object/${result.nftObjectId}`}
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
          </div>
        )}

        {/* Error */}
        {mintState === "error" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-red-400 text-3xl">&#10007;</span>
            </div>
            <p className="text-red-400 text-center text-sm">{errorMessage}</p>
            <ButtonV3
              variant="gradient"
              size="sm"
              onClick={handleRetry}
            >
              Try Again
            </ButtonV3>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
