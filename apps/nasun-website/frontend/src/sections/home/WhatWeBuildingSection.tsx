import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV2 } from "@/components/ui/button-v2";
const gensolVideo = "/videos/Trakker-Flying-26rf.mp4";
const baramVideo = "/videos/Baram-U-rf10.mp4";
const padoVideo = "/videos/Pado-Ui-Short-rf20.mp4";
const explorerVideo = "/videos/Network-Explorer-Ui-rf12.mp4";

const CustomArrow = ({
  onClick,
  direction,
}: {
  onClick?: () => void;
  direction: "left" | "right";
}) => (
  <button
    onClick={onClick}
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-nasun-white/10 p-3 rounded-full shadow-lg hover:bg-black/50 transition-all border border-nasun-white/50 hover:border-white/60 ${
      direction === "left" ? "-left-20 xl:-left-24" : "-right-20 xl:-right-24"
    }`}
    aria-label={direction === "left" ? "Previous slide" : "Next slide"}
  >
    {direction === "left" ? (
      <ChevronLeftIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    ) : (
      <ChevronRightIcon className="w-6 h-6 text-nasun-white/60 transition-all" />
    )}
  </button>
);

type ContentPosition = "bottom-center" | "right-center";

type SlideData = {
  id: string;
  bgColor: string;
  buttonPrefix: string;
  projectName: string;
  nameKey: string;
  buttonVariant:
    | "red"
    | "blue"
    | "white"
    | "purple"
    | "gensol-red"
    | "sf-orange"
    | "baram"
    | "pado"
    | "nasun-network";
  link: string;
  video?: string;
  videoStartTime?: number;
  contentPosition?: ContentPosition;
};

const SLIDES: SlideData[] = [
  {
    id: "gensol",
    bgColor: "#2d1b3d",
    buttonPrefix: "EXPLORE",
    projectName: "GEN SOL",
    nameKey: "gensol",
    buttonVariant: "sf-orange",
    link: "/ip/gensol",
    video: gensolVideo,
    contentPosition: "right-center",
  },
  {
    id: "baram",
    bgColor: "#f7f4ef",
    buttonPrefix: "EXPLORE",
    projectName: "BARAM",
    nameKey: "baram",
    buttonVariant: "baram",
    link: "/baram",
    video: baramVideo,
  },
  {
    id: "pado",
    bgColor: "#0f4f4f",
    buttonPrefix: "EXPLORE",
    projectName: "PADO",
    nameKey: "pado",
    buttonVariant: "pado",
    link: "/pado",
    video: padoVideo,
  },
  {
    id: "protocol",
    bgColor: "#1a2744",
    buttonPrefix: "EXPLORE",
    projectName: "NASUN",
    nameKey: "nasun",
    buttonVariant: "nasun-network",
    link: "/about/strategy",
    video: explorerVideo,
  },
];

function WhatWeBuildingSection() {
  const { t, i18n } = useTranslation("home");
  const isKorean = i18n.language === "ko";
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<Slider>(null);
  const activeSlideRef = useRef(0);
  const [hasEnteredView, setHasEnteredView] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Start video playback only when the section enters the viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEnteredView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Play only the first slide's video once section is in view
  useEffect(() => {
    if (!hasEnteredView) return;
    const container = containerRef.current;
    if (!container) return;

    const activeVideo = container.querySelector<HTMLVideoElement>(
      `.slick-slide[data-index="0"]:not(.slick-cloned) video`,
    );
    activeVideo?.play().catch(() => {});
  }, [hasEnteredView]);

  // Pause cloned videos to prevent currentTime drift.
  // Paused clones never accumulate drift, making sync before transitions reliable.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const doPauseClones = () => {
      container.querySelectorAll<HTMLVideoElement>(".slick-cloned video").forEach((v) => {
        if (!v.paused) v.pause();
      });
    };

    // Pause after slick initializes clones
    const timer = setTimeout(doPauseClones, 100);
    const observer = new MutationObserver(doPauseClones);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Before transition: reset clone to the next slide's videoStartTime and start playback.
  // This prevents frame jumps when looping (e.g., Protocol → GenSol).
  const syncAndPlayClones = useCallback((_current: number, next: number) => {
    const container = containerRef.current;
    if (!container) return;

    const nextSlide = SLIDES[next];
    const originalVideo = container.querySelector<HTMLVideoElement>(
      `.slick-slide[data-index="${next}"]:not(.slick-cloned) video`,
    );
    if (!originalVideo?.currentSrc) return;

    const clones = container.querySelectorAll<HTMLVideoElement>(".slick-cloned video");
    clones.forEach((clone) => {
      if (clone.currentSrc === originalVideo.currentSrc) {
        clone.currentTime = nextSlide?.videoStartTime ?? 0;
        clone.play().catch(() => {});
      }
    });
  }, []);

  // After transition: update active index, reset+play new video, pause others and clones
  const handleAfterChange = useCallback((index: number) => {
    activeSlideRef.current = index;
    setActiveSlideIndex(index);
    const container = containerRef.current;
    if (!container) return;

    // Pause all original videos
    container
      .querySelectorAll<HTMLVideoElement>(".slick-slide:not(.slick-cloned) video")
      .forEach((v) => {
        if (!v.paused) v.pause();
      });

    // Reset and play the newly active video
    const slide = SLIDES[index];
    const activeVideo = container.querySelector<HTMLVideoElement>(
      `.slick-slide[data-index="${index}"]:not(.slick-cloned) video`,
    );
    if (activeVideo) {
      activeVideo.currentTime = slide.videoStartTime ?? 0;
      activeVideo.play().catch(() => {});
    }

    // Pause clone videos
    container.querySelectorAll<HTMLVideoElement>(".slick-cloned video").forEach((v) => {
      if (!v.paused) v.pause();
    });
  }, []);

  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true,
    prevArrow: <CustomArrow direction="left" />,
    nextArrow: <CustomArrow direction="right" />,
    beforeChange: syncAndPlayClones,
    afterChange: handleAfterChange,
  };

  return (
    <SectionLayout className="max-w-none relative min-h-screen !h-auto bg-nasun-black !justify-start">
      <div className="relative z-10 flex flex-col items-center pt-[max(4.5rem,8vh)] pb-16 md:pb-20 lg:pb-24 px-4 md:px-8">
        {/* Section Title */}
        <FadeInUp>
          <SectionTitle
            as="h2"
            color="white"
            className="!font-eurostile text-center !mb-6 md:!mb-9 lg:!mb-12 uppercase"
          >
            What We're Building
          </SectionTitle>
        </FadeInUp>

        {/* Carousel Card */}
        <FadeInUp delay="0.2s">
          <div className="relative w-full max-w-[1920px] mx-auto">
            <div
              ref={containerRef}
              className="relative w-full min-w-[76vw] max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-0 lg:px-16 xl:px-20"
            >
              <Slider ref={sliderRef} {...sliderSettings}>
                {SLIDES.map((slide) => (
                  <div key={slide.id}>
                    <div
                      className="relative rounded-sm overflow-hidden aspect-video"
                      style={{ backgroundColor: slide.bgColor }}
                    >
                      {/* Background Video */}
                      {slide.video && (
                        <video
                          ref={(el) => {
                            if (!el) return;
                            if (slide.videoStartTime && el.currentTime === 0) {
                              el.currentTime = slide.videoStartTime;
                            }
                          }}
                          muted
                          playsInline
                          preload="auto"
                          onEnded={(e) => {
                            // Ignore events from cloned slides
                            const slideEl = e.currentTarget.closest(".slick-slide");
                            if (slideEl?.classList.contains("slick-cloned")) return;
                            sliderRef.current?.slickNext();
                          }}
                          className={`absolute inset-0 w-full h-full ${slide.id === "baram" ? "object-contain" : "object-cover"} ${slide.id === "pado" ? "object-top" : ""}`}
                        >
                          <source src={slide.video} type="video/mp4" />
                        </video>
                      )}

                      {/* Dark overlay for readability */}
                      {/* {slide.video && <div className="absolute inset-0 bg-black/30" />} */}
                    </div>
                  </div>
                ))}
              </Slider>

              {/* Button + Navigation Dots (outside card) */}
              <div className="flex flex-col items-center mt-6 gap-8">
                <ButtonV2
                  variant={SLIDES[activeSlideIndex].buttonVariant}
                  size="md"
                  asChild
                  className="w-[200px] md:w-[240px]"
                >
                  <Link to={SLIDES[activeSlideIndex].link}>
                    {isKorean ? (
                      <>
                        <span className="font-semibold mr-1">{t(`whatWeBuilding.${SLIDES[activeSlideIndex].nameKey}`)}</span>
                        {t("whatWeBuilding.prefix")}
                      </>
                    ) : (
                      <>
                        {t("whatWeBuilding.prefix")}
                        <span className="font-semibold ml-1">{t(`whatWeBuilding.${SLIDES[activeSlideIndex].nameKey}`)}</span>
                      </>
                    )}
                  </Link>
                </ButtonV2>

                <div className="flex items-center gap-6">
                  {SLIDES.map((slide, i) => (
                    <button
                      key={slide.id}
                      onClick={() => sliderRef.current?.slickGoTo(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        i === activeSlideIndex
                          ? "bg-nasun-nw1"
                          : "bg-nasun-white/40 hover:bg-nasun-white/60"
                      }`}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FadeInUp>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhatWeBuildingSection);
