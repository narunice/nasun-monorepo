import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import FadeInUp from "../home/FadeInUp";

const HERO_IMAGE_SRC = "/images/About-Page-Triangle-B&W.webp";

export default function DevAboutHeroSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.fetchPriority = "high";
    img.decoding = "async";
    img.src = HERO_IMAGE_SRC;
    if (img.complete && img.naturalWidth > 0) {
      setImageReady(true);
      return;
    }
    let cancelled = false;
    const done = () => {
      if (!cancelled) setImageReady(true);
    };
    img.addEventListener("load", done);
    img.addEventListener("error", done);
    return () => {
      cancelled = true;
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
    };
  }, []);

  const handleOpenApp = () => {
    if (isAuthenticated) {
      navigate("/my-account");
    } else {
      window.dispatchEvent(new CustomEvent("nasun:open-login"));
    }
  };

  return (
    <section className="ch-hero ch-hero-about">
      <img
        className="ch-hero-bg"
        src={HERO_IMAGE_SRC}
        alt=""
        loading="eager"
        decoding="async"
        // @ts-expect-error fetchpriority is a valid HTML attribute
        fetchpriority="high"
        aria-hidden="true"
        style={{ opacity: imageReady ? 1 : 0, transition: "opacity 800ms ease-out" }}
      />

      <div
        className="ch-container"
        style={{
          opacity: imageReady ? 1 : 0,
          transition: "opacity 300ms ease-out",
        }}
      >
        <FadeInUp className="max-w-[680px] flex flex-col text-left">
          <h1 className="ch-display-wide">
            Build a <span className="ch-accent-pado">Financial Dynasty</span>
            <br />
            with Your Team of AI Agents
          </h1>
          <p className="ch-lead mt-5">
            On Nasun, you run a team of AI agents working the markets for you.
            Each one builds its own record, and all of that activity rolls up
            into the standing that belongs to you. Over time, that standing
            becomes real financial power. All of it earned, all of it yours.
          </p>
          <div className="flex flex-wrap gap-3 justify-start mt-7">
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
