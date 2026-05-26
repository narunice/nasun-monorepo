import { useMemo, useRef } from "react";
import Slider, { type Settings } from "react-slick";
import { Link } from "react-router-dom";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import type { HistoryItem } from "@/types/grants";

function ArrowButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous award" : "Next award"}
      className={`ch-grants-arrow ch-grants-arrow-${direction}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {direction === "prev" ? (
          <polyline points="15 18 9 12 15 6" />
        ) : (
          <polyline points="9 18 15 12 9 6" />
        )}
      </svg>
    </button>
  );
}

export default function DevAboutGrantsSection() {
  const sliderRef = useRef<Slider | null>(null);
  const { t } = useTranslation("grants");
  const grantsList = (t("grants.list", { returnObjects: true }) as HistoryItem[]) || [];

  const settings = useMemo<Settings>(
    () => ({
      dots: true,
      infinite: grantsList.length > 3,
      speed: 600,
      slidesToShow: 3,
      slidesToScroll: 1,
      arrows: false,
      autoplay: true,
      autoplaySpeed: 5000,
      pauseOnHover: true,
      adaptiveHeight: false,
      customPaging: () => <span className="ch-grants-dot" />,
      responsive: [
        {
          breakpoint: 1200,
          settings: {
            slidesToShow: 2,
            infinite: grantsList.length > 2,
          },
        },
        {
          breakpoint: 768,
          settings: {
            slidesToShow: 1,
            infinite: grantsList.length > 1,
            arrows: false,
          },
        },
      ],
    }),
    [grantsList.length],
  );

  return (
    <ChSection id="awards" innerClassName="ch-about-grants" fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">03 / Recognition</span>
        <h2 className="ch-display">Awards &amp; Grants</h2>
      </FadeInUp>

      <FadeInUp delayMs={200}>
        <div className="ch-grants-wrap">
          {grantsList.length === 0 ? (
            <p className="ch-body ch-subdued">No records available.</p>
          ) : (
            <>
              <div className="ch-grants-controls">
                <ArrowButton
                  direction="prev"
                  onClick={() => sliderRef.current?.slickPrev()}
                />
                <ArrowButton
                  direction="next"
                  onClick={() => sliderRef.current?.slickNext()}
                />
              </div>
              <Slider ref={sliderRef} {...settings}>
                {grantsList.map((item, idx) => (
                  <div key={idx} className="ch-grants-slide">
                    <article className="ch-grants-card">
                      <span className="ch-grants-card-halo" aria-hidden="true" />
                      <header className="ch-grants-card-head">
                        <p className="ch-grants-card-date">{item.date}</p>
                        <h3 className="ch-grants-card-title">{item.event_name}</h3>
                      </header>
                      <div className="ch-grants-card-divider" aria-hidden="true" />
                      <p className="ch-grants-card-prize">
                        {item.prize}
                        {item.amount ? ` · ${item.amount}` : ""}
                      </p>
                      <p className="ch-grants-card-project">{item.project}</p>
                      {item.host && item.host.length > 0 && (
                        <ul className="ch-grants-card-hosts">
                          {item.host.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      )}
                      <footer className="ch-grants-card-foot">
                        {item.logos?.dark?.length > 0 && (
                          <div className="ch-grants-card-logos">
                            {item.logos.dark.map((logo) => (
                              <img
                                key={logo}
                                src={`/${logo}`}
                                alt=""
                                loading="lazy"
                                className="ch-grants-card-logo"
                              />
                            ))}
                          </div>
                        )}
                        {item.slug && (
                          <Link
                            to={`/news-events/${item.slug}`}
                            className="ch-grants-card-readmore"
                          >
                            <span>Read more</span>
                            <span aria-hidden="true" className="ch-grants-card-readmore-arrow">→</span>
                          </Link>
                        )}
                      </footer>
                    </article>
                  </div>
                ))}
              </Slider>
            </>
          )}
        </div>
      </FadeInUp>
    </ChSection>
  );
}
