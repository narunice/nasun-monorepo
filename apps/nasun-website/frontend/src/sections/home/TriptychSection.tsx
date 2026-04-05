import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV3 } from "@/components/ui/button-v3";
import { Spinner } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAirdropRegistration } from "@/sections/myAccount/hooks/useAirdropRegistration";

import kaeboImg from "@/assets/images/kaebo.webp";
import josenImg from "@/assets/images/josen.webp";
import canyonImg from "@/assets/images/canyon.webp";

// Alliance column gradient (from AllianceNftHeroSection)
const ALLIANCE_GRADIENT =
  "linear-gradient(135deg, #141e30 0%, #1e3a5f 35%, #3a6186 65%, #6b8fad 100%)";
const ALLIANCE_GLOW =
  "radial-gradient(ellipse at 75% 50%, rgba(110,160,210,0.15), transparent 60%)";

// Airdrop column gradient
const AIRDROP_GRADIENT =
  "linear-gradient(180deg, #0a0a0a 0%, #111118 50%, #0a0a0a 100%)";

// Bottom vignette for label/button readability + character fade-out
const BOTTOM_VIGNETTE =
  "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 35%, transparent 60%)";

// Alliance column bottom vignette (matches blue gradient base)
const ALLIANCE_BOTTOM_FADE =
  "linear-gradient(to top, #141e30 0%, #141e30 15%, rgba(20,30,48,0.95) 30%, rgba(20,30,48,0.7) 45%, transparent 65%)";

// Airdrop column bottom vignette (matches dark gradient base)
const AIRDROP_BOTTOM_FADE =
  "linear-gradient(to top, #0a0a0a 0%, #0a0a0a 10%, rgba(10,10,10,0.95) 25%, rgba(10,10,10,0.7) 40%, transparent 60%)";

const AIRDROP_STATUS = {
  not_applied: { label: "Not registered", color: "text-nasun-white/40" },
  pending: { label: "Pending", color: "text-yellow-400" },
  approved: { label: "Registered", color: "text-emerald-400" },
  rejected: { label: "Rejected", color: "text-red-400" },
} as const;

export default function TriptychSection() {
  const { user } = useAuth();
  const { status, isLoading, isRegistering, error, register } =
    useAirdropRegistration(user?.cognitoToken);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleAirdropClick = useCallback(() => {
    if (!user) return;
    setShowConfirm(true);
  }, [user]);

  const handleConfirmedRegister = useCallback(async () => {
    setShowConfirm(false);
    await register();
    setShowSuccess(true);
  }, [register]);

  const isRegistered = status === "approved" || status === "pending";

  return (
    <div className="flex flex-col md:flex-row w-full h-full">
      {/* ===== LEFT: Alliance ===== */}
      <div
        className="group flex-1 relative overflow-hidden min-h-[60vh] md:min-h-0 cursor-pointer"
        style={{ background: ALLIANCE_GRADIENT }}
      >
        {/* Atmospheric glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: ALLIANCE_GLOW }}
        />

        {/* Character */}
        <img
          src={kaeboImg}
          alt="Kaebo"
          className="absolute bottom-[22%] left-1/2 -translate-x-1/2 h-[64%] w-auto max-w-none pointer-events-none transition-transform duration-700 origin-bottom group-hover:scale-[1.015]"
        />

        {/* Bottom fade (color-matched to blend character cutoff) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: ALLIANCE_BOTTOM_FADE }}
        />

        {/* Label + Details + Button */}
        <div className="absolute bottom-[4%] md:bottom-[6%] inset-x-0 z-10 flex flex-col items-center">
          <FadeInUp delay="0s">
            <div className="flex flex-col items-center">
              <h3 className="!font-eurostile text-nasun-white text-3xl md:text-4xl tracking-[0.2em] uppercase">
                Alliance
              </h3>
              <div className="mt-4 h-[100px] md:h-[200px] text-center text-nasun-white/80 text-sm md:text-base leading-relaxed space-y-1.5 px-4">
                <p className="text-nasun-white font-semibold text-base md:text-lg">
                  Free NFT Mint
                </p>
                <p>Points + Trade + Games + Apps + Leaderboards</p>
                <p>No Seed Phrases. Just Clicks</p>
              </div>
              <div className="mt-6">
                <ButtonV3 variant="nw2" size="lg" asChild>
                  <Link to="/wave1/alliance-nft">Explore</Link>
                </ButtonV3>
              </div>
            </div>
          </FadeInUp>
        </div>
      </div>

      {/* ===== CENTER: Genesis Pass ===== */}
      <div className="group flex-1 relative overflow-hidden min-h-[60vh] md:min-h-0">
        {/* Canyon background image (center-cropped) */}
        <img
          src={canyonImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-transform duration-700 group-hover:scale-[1.015]"
        />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/35 pointer-events-none" />

        {/* Bottom vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: BOTTOM_VIGNETTE }}
        />

        {/* Label + Details + Button */}
        <div className="absolute bottom-[4%] md:bottom-[6%] inset-x-0 z-10 flex flex-col items-center">
          <FadeInUp delay="0.15s">
            <div className="flex flex-col items-center">
              <h3 className="!font-eurostile text-nasun-white text-3xl md:text-4xl tracking-[0.2em] uppercase text-center">
                Genesis Pass
              </h3>
              <div className="mt-4 h-[120px] md:h-[200px] flex flex-col items-center px-4">
                <p className="text-nasun-white font-semibold text-base md:text-lg">
                  2x Boost
                </p>
                <ul className="mt-2 text-left text-nasun-white/70 text-xs md:text-sm leading-relaxed space-y-0.5">
                  <li>Free Mint: Apr 7 &mdash; 3:00 PM UTC</li>
                  <li>GTD Allowlist: Apr 8 &mdash; 3:00 AM UTC @ ~$8 in ETH</li>
                  <li>
                    FCFS Allowlist: Apr 8 &mdash; 3:00 PM UTC @ ~$10 in ETH
                  </li>
                  <li>Public Mint: Apr 9 &mdash; 3:00 PM UTC @ ~$15 in ETH</li>
                  <li>Mint closes: Apr 14 &mdash; 3:00 PM UTC</li>
                </ul>
              </div>
              <div className="mt-6">
                <ButtonV3 variant="nw2" size="lg" asChild>
                  <Link to="/wave1/genesis-pass-drop">Explore</Link>
                </ButtonV3>
              </div>
            </div>
          </FadeInUp>
        </div>
      </div>

      {/* ===== RIGHT: Airdrop ===== */}
      <div
        className="group flex-1 relative overflow-hidden min-h-[60vh] md:min-h-0"
        style={{ background: AIRDROP_GRADIENT }}
      >
        {/* Character */}
        <img
          src={josenImg}
          alt="Josen"
          className="absolute bottom-[14%] left-[46%] -translate-x-1/2 h-[73%] w-auto max-w-none pointer-events-none transition-transform duration-700 origin-bottom group-hover:scale-[1.015]"
        />

        {/* Bottom fade (color-matched to blend character cutoff) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: AIRDROP_BOTTOM_FADE }}
        />

        {/* Label + Details + Button/Status */}
        <div className="absolute bottom-[4%] md:bottom-[6%] inset-x-0 z-10 flex flex-col items-center">
          <FadeInUp delay="0.3s">
            <div className="flex flex-col items-center">
              <h3 className="!font-eurostile text-nasun-white text-3xl md:text-4xl tracking-[0.2em] uppercase">
                Airdrop
              </h3>
              <div className="mt-4 h-[95px] md:h-[200px] text-center text-nasun-white/80 text-sm md:text-base leading-relaxed space-y-1.5 px-4">
                <p className="text-nasun-white font-semibold text-base md:text-lg">
                  200,000 Points
                </p>
                <p>Registration Closes April 8th</p>
                <p>Airdrop April 16th</p>
              </div>
              <div className="mt-6">
                {!user ? (
                  <ButtonV3
                    variant="nw2"
                    size="lg"
                    onClick={() => {
                      localStorage.setItem("auth_return_to", "/my-account");
                      window.dispatchEvent(new CustomEvent("nasun:open-login"));
                    }}
                  >
                    Sign in to register
                  </ButtonV3>
                ) : isLoading ? (
                  <Spinner />
                ) : isRegistered ? (
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`text-sm font-medium ${AIRDROP_STATUS[status].color}`}
                    >
                      {AIRDROP_STATUS[status].label}
                    </span>
                  </div>
                ) : (
                  <ButtonV3
                    variant="nw2"
                    size="sm"
                    disabled={isRegistering}
                    onClick={handleAirdropClick}
                  >
                    {isRegistering ? "Registering..." : "Register"}
                  </ButtonV3>
                )}

                {error && (
                  <p className="text-red-400 text-xs max-w-[200px] text-center">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </FadeInUp>
        </div>

        {/* Confirm Dialog */}
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="max-w-sm text-center !bg-slate-800">
            <DialogHeader className="items-center">
              <DialogTitle>Airdrop Registration</DialogTitle>
              <DialogDescription className="text-nasun-white/70 pt-2">
                Register for the April 16th Airdrop?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center gap-3 mt-2">
              <ButtonV3
                variant="nw2"
                size="sm"
                onClick={handleConfirmedRegister}
                disabled={isRegistering}
              >
                {isRegistering ? "Registering..." : "Register"}
              </ButtonV3>
              <ButtonV3
                variant="nw2"
                size="sm"
                outline
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </ButtonV3>
            </div>
          </DialogContent>
        </Dialog>

        {/* Success Dialog */}
        <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
          <DialogContent className="max-w-sm text-center !bg-slate-800">
            <DialogHeader className="items-center">
              <DialogTitle>Registration Complete</DialogTitle>
              <DialogDescription className="text-nasun-white/70 pt-2">
                Successfully registered. Status will be updated.
              </DialogDescription>
            </DialogHeader>
            <ButtonV3
              variant="nw2"
              size="sm"
              onClick={() => setShowSuccess(false)}
              className="mt-2"
            >
              Close
            </ButtonV3>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
