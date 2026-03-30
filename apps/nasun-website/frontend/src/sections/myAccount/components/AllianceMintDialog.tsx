/**
 * AllianceMintDialog Component
 *
 * 2-step dialog: image+wallet selection -> minting result.
 * Server-side minting via governance-api Lambda.
 */

import { FC, useState } from "react";
import { toast } from "react-toastify";
import { mintAllianceNft, type AllianceWallet } from "@/services/allianceNftApi";
import { invalidateAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ALLIANCE_IMAGES, EXPLORER_TX_URL } from "@/constants/alliance";

interface AllianceMintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: AllianceWallet[];
  cognitoToken: string;
}

type MintState = "select" | "minting" | "success" | "error";

const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const AllianceMintDialog: FC<AllianceMintDialogProps> = ({
  open,
  onOpenChange,
  wallets,
  cognitoToken,
}) => {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [selectedWallet, setSelectedWallet] = useState(0);
  const [mintState, setMintState] = useState<MintState>("select");
  const [result, setResult] = useState<{ txDigest: string; nftObjectId: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const resetState = () => {
    setSelectedImage(null);
    setSelectedWallet(0);
    setMintState("select");
    setResult(null);
    setErrorMessage("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const handleMint = async () => {
    if (selectedImage === null) return;

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
    setMintState("select");
    setErrorMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-nasun-c5/30">
        <DialogHeader>
          <DialogTitle className="text-nasun-white">
            {mintState === "success" ? "NFT Minted!" : "Mint Alliance NFT"}
          </DialogTitle>
          {mintState === "select" && (
            <DialogDescription className="text-nasun-white/70">
              Choose an image for your Alliance NFT
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Step 1: Select image + wallet */}
        {mintState === "select" && (
          <div className="flex flex-col gap-4">
            {/* Image grid */}
            <div className="grid grid-cols-2 gap-3">
              {ALLIANCE_IMAGES.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === i
                      ? "border-nasun-c7 ring-2 ring-nasun-c7/50"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <img
                    src={url}
                    alt={`Alliance #${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedImage === i && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-nasun-c7 flex items-center justify-center">
                      <span className="text-white text-sm">&#10003;</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Wallet selector */}
            {wallets.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-nasun-white/70 text-sm">Mint to wallet</label>
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
              <p className="text-nasun-white/50 text-sm">
                Mint to: <span className="font-mono">{shortenAddress(wallets[0].walletAddress)}</span>
              </p>
            )}

            <Button
              onClick={handleMint}
              variant="filledOutlineC7"
              size="default"
              disabled={selectedImage === null}
              className="w-full"
            >
              Mint
            </Button>
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
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 text-3xl">&#10003;</span>
            </div>
            <p className="text-nasun-white text-center">
              Your Alliance NFT has been minted successfully!
            </p>
            <a
              href={`${EXPLORER_TX_URL}/${result.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-c7 hover:text-nasun-c7/80 text-sm underline underline-offset-2"
            >
              View on Explorer
            </a>
            <Button
              onClick={() => handleOpenChange(false)}
              variant="filledOutlineC7"
              size="sm"
            >
              Done
            </Button>
          </div>
        )}

        {/* Error */}
        {mintState === "error" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-red-400 text-3xl">&#10007;</span>
            </div>
            <p className="text-red-400 text-center text-sm">{errorMessage}</p>
            <Button
              onClick={handleRetry}
              variant="filledOutlineC7"
              size="sm"
            >
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
