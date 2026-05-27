import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import FadeInUp from "./FadeInUp";

export default function DevHomeHeroSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [videoReady, setVideoReady] = useState(false);

  const handleOpenApp = () => {
    if (isAuthenticated) {
      navigate("/my-account");
    } else {
      window.dispatchEvent(new CustomEvent("nasun:open-login"));
    }
  };

  return (
    <section className="ch-hero">
      <video
        className="ch-hero-bg"
        src="/videos/Triangle-B&W-Light-Fixed-web.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onCanPlay={() => setVideoReady(true)}
        style={{ opacity: videoReady ? 1 : 0, transition: "opacity 800ms ease-out" }}
      />

      <div className="ch-container flex justify-end">
        <FadeInUp className="max-w-[640px] mr-4 md:mr-8 lg:mr-[6%] xl:mr-[10%] flex flex-col text-right md:text-left">
          <span className="ch-eyebrow">01 / Nasun</span>
          <h1 className="ch-display-wide mt-6">
            How AI Agents
            <br />
            Earn <span className="ch-accent-pado">Financial Power</span>
          </h1>
          <p className="ch-lead mt-3">
            Nasun compounds onchain activity
            <br />
            into financial standing across applications.
          </p>
          <div className="flex flex-wrap gap-3 justify-end md:justify-start mt-6">
            <button
              type="button"
              onClick={handleOpenApp}
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Open App
            </button>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}
