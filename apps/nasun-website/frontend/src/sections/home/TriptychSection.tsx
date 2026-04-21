import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV3 } from "@/components/ui/button-v3";
import { Spinner } from "@/components/ui";
import { useAirdropRegistration } from "@/sections/myAccount/hooks/useAirdropRegistration";

import kaeboImg from "@/assets/images/Princess-Kaebo-Fixed.webp";
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

export default function TriptychSection() {
  const { user } = useAuth();
  const { status, isLoading } = useAirdropRegistration(user?.cognitoToken);

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
                <p>Points + Trade • Games • Apps + Leaderboards</p>
                <p>No Seed Phrases • Just Clicks</p>
              </div>
              <div className="mt-2 mb-6 md:mt-6 md:mb-0">
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
              <div className="mt-2 mb-6 md:mt-6 md:mb-0">
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
                ) : (
                  <ButtonV3 variant="nw2" size="lg" asChild>
                    <Link to="/my-account">
                      {isRegistered ? "Registered" : "Not Registered"}
                      <svg
                        className="w-4 h-4 ml-1.5 inline-block"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.22 14.78a.75.75 0 010-1.06l7.22-7.22H8.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V7.06l-7.22 7.22a.75.75 0 01-1.06 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </Link>
                  </ButtonV3>
                )}
              </div>
            </div>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
