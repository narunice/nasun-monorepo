import { Link, useNavigate } from "react-router-dom";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV4 } from "@/components/ui/button-v4";
import { useAuth } from "@/features/auth/hooks/useAuth";

import kaeboImg from "@/assets/images/Princess-Kaebo-Fixed.webp";
import josenImg from "@/assets/images/josen.webp";

const ALLIANCE_GRADIENT =
  "linear-gradient(135deg, #141e30 0%, #1e3a5f 35%, #3a6186 65%, #6b8fad 100%)";
const ALLIANCE_GLOW =
  "radial-gradient(ellipse at 75% 50%, rgba(110,160,210,0.15), transparent 60%)";
const ALLIANCE_BOTTOM_FADE =
  "linear-gradient(to top, #141e30 0%, #141e30 15%, rgba(20,30,48,0.95) 30%, rgba(20,30,48,0.7) 35%, transparent 71%)";

const CREATOR_GRADIENT =
  "linear-gradient(180deg, #0a0a0a 0%, #111118 50%, #0a0a0a 100%)";
const CREATOR_BOTTOM_FADE =
  "linear-gradient(to top, #0a0a0a 0%, #0a0a0a 10%, rgba(10,10,10,0.95) 25%, rgba(10,10,10,0.7) 40%, transparent 60%)";

const CREATOR_POSTS_PATH = "/my-account?scroll=creator-posts";

export default function AllianceCreatorSection() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleCreatorPostsClick = () => {
    if (isAuthenticated) {
      navigate(CREATOR_POSTS_PATH);
    } else {
      localStorage.setItem("auth_return_to", CREATOR_POSTS_PATH);
      window.dispatchEvent(new CustomEvent("nasun:open-login"));
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-full">
      {/* ===== LEFT: Alliance NFT ===== */}
      <div
        className="group flex-1 relative overflow-hidden min-h-[60vh] md:min-h-0 cursor-pointer"
        style={{ background: ALLIANCE_GRADIENT }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: ALLIANCE_GLOW }}
        />

        <img
          src={kaeboImg}
          alt="Kaebo"
          className="absolute bottom-[28%] left-1/2 -translate-x-1/2 h-[67%] w-auto max-w-none pointer-events-none transition-transform duration-700 origin-bottom group-hover:scale-[1.015]"
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: ALLIANCE_BOTTOM_FADE }}
        />

        <div className="absolute bottom-[18%] md:bottom-[22%] inset-x-0 z-10 flex flex-col items-center">
          <FadeInUp delay="0s">
            <div className="flex flex-col items-center">
              <h3 className="!font-eurostile text-nasun-white text-3xl md:text-4xl tracking-[0.2em] uppercase text-center">
                Alliance NFT
              </h3>
              <div className="mt-4 text-center text-nasun-white/80 text-sm md:text-base leading-relaxed space-y-1.5 px-4">
                <p>Points + Trade • Games • Apps + Leaderboards</p>
                <p>No Seed Phrases • Just Clicks</p>
              </div>
            </div>
          </FadeInUp>
        </div>
        <div className="absolute bottom-[6%] md:bottom-[10%] inset-x-0 z-10 flex justify-center">
          <FadeInUp delay="0.1s">
            <ButtonV4 color="light" size="lg" asChild>
              <Link to="/wave1/alliance-nft">Mint Free Alliance NFT</Link>
            </ButtonV4>
          </FadeInUp>
        </div>
      </div>

      {/* ===== RIGHT: X Creators Program ===== */}
      <div
        className="group flex-1 relative overflow-hidden min-h-[60vh] md:min-h-0"
        style={{ background: CREATOR_GRADIENT }}
      >
        <img
          src={josenImg}
          alt="Josen"
          className="absolute bottom-[14%] left-[46%] -translate-x-1/2 h-[78%] w-auto max-w-none pointer-events-none transition-transform duration-700 origin-bottom group-hover:scale-[1.015]"
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: CREATOR_BOTTOM_FADE }}
        />

        <div className="absolute bottom-[18%] md:bottom-[22%] inset-x-0 z-10 flex flex-col items-center">
          <FadeInUp delay="0.15s">
            <div className="flex flex-col items-center">
              <h3 className="!font-eurostile text-nasun-white text-3xl md:text-4xl tracking-[0.2em] uppercase text-center">
                X Creators <br />
                Program
              </h3>
              <div className="mt-4 text-center text-nasun-white/80 text-sm md:text-base leading-relaxed space-y-1.5 px-4">
                <p>Sign Up and Link X Account</p>
                <p>No Seed Phrases • Just Clicks</p>
              </div>
            </div>
          </FadeInUp>
        </div>
        <div className="absolute bottom-[6%] md:bottom-[10%] inset-x-0 z-10 flex justify-center">
          <FadeInUp delay="0.25s">
            <ButtonV4 color="light" size="lg" onClick={handleCreatorPostsClick}>
              {isAuthenticated ? "Submit Posts" : "Sign Up / Login"}
            </ButtonV4>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
