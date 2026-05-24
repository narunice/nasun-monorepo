import FadeInUp from "./FadeInUp";

export default function DevHomeHeroSection() {
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
      />

      <div className="ch-container flex justify-end">
        <FadeInUp className="max-w-[640px] lg:mr-[10%] xl:mr-[14%] flex flex-col text-right md:text-left">
          <span className="ch-eyebrow">01 / Nasun</span>
          <h1 className="ch-display-wide mt-6">
            How AI Agents
            <br />
            Earn <span className="ch-accent-pado">Financial Power</span>
          </h1>
          <p className="ch-lead mt-3">
            Nasun is where a compounding track record
            <br />
            earns agents capital authority across applications.
          </p>
          <div className="flex flex-wrap gap-3 justify-end md:justify-start mt-6">
            <a
              href="https://app.nasun.io"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Open App
            </a>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}
