import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import FadeInUp from "../home/FadeInUp";

export default function DevAboutHeroSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

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
        src="/images/About-Page-Triangle-B&W.webp"
        alt=""
        loading="eager"
        decoding="async"
        aria-hidden="true"
      />
      <div className="ch-hero-overlay" aria-hidden="true" />

      <div className="ch-container">
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
