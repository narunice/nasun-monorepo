/**
 * ARCHIVE — not in production. See apps/nasun-website/CLAUDE.md
 * Operational Invariants #11. Only rendered by Home2026MayPage at
 * /archive/home-may2026.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ecosystemAiPath } from "@/config/featureFlags";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV4 } from "@/components/ui/button-v4";

const gensolVideo = "/videos/Color-Trailer-No-Symbol-16x9-No-Brightness-web.mp4";
const baramVideo = "/videos/baram-new-ui-video-smaller-fonts-web.mp4";
const padoVideo = "/videos/Pado-Ui-Short-rf28.mp4";
const padoVideoMobile = "/videos/Pado-Ui-Short-mobile-rf28.mp4";
const explorerVideo = "/videos/Network-Explorer-Ui-rf28.mp4";
const explorerVideoMobile = "/videos/Network-Explorer-Ui-mobile-rf28.mp4";

type SlideData = {
  id: string;
  bgColor: string;
  buttonPrefix: string;
  projectName: string;
  buttonVariant: "sf-orange" | "baram" | "pado" | "nasun-network";
  link: string;
  video?: string;
  mobileVideo?: string;
  poster?: string;
  videoStartTime?: number;
};

const SLIDES: SlideData[] = [
  {
    id: "gensol",
    bgColor: "#0b1120",
    buttonPrefix: "EXPLORE",
    projectName: "GEN SOL",
    buttonVariant: "sf-orange",
    link: "/ecosystem/gensol",
    video: gensolVideo,
    poster: "/images/posters/Trakker-Flying-rf28.webp",
  },
  {
    id: "baram",
    bgColor: "#0b1120",
    buttonPrefix: "EXPLORE",
    projectName: "NASUN AI",
    buttonVariant: "baram",
    link: ecosystemAiPath,
    video: baramVideo,
    poster: "/images/posters/baram-new-ui-video-smaller-fonts-web.webp",
  },
  {
    id: "pado",
    bgColor: "#0b1120",
    buttonPrefix: "EXPLORE",
    projectName: "PADO",
    buttonVariant: "pado",
    link: "/ecosystem/pado",
    video: padoVideo,
    mobileVideo: padoVideoMobile,
    poster: "/images/posters/Pado-Ui-Short-rf28.webp",
  },
  {
    id: "protocol",
    bgColor: "#0b1120",
    buttonPrefix: "EXPLORE",
    projectName: "NASUN",
    buttonVariant: "nasun-network",
    link: "/network/nsn",
    video: explorerVideo,
    mobileVideo: explorerVideoMobile,
    poster: "/images/posters/Network-Explorer-Ui-rf28.webp",
  },
];

function WhatWeBuild2026Section() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<Slider>(null);
  const activeSlideRef = useRef(0);
  const [hasEnteredView, setHasEnteredView] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const isMobile = useIsMobile();

  // Intersection Observer to detect when section enters viewport
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
      { threshold: 0.1 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const playVideo = (video: HTMLVideoElement | null) => {
    if (video) {
      video.play().catch((err) => {
        console.warn("Video play failed or interrupted:", err);
      });
    }
  };

  const preloadAdjacentSlides = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const adjacent = [
      (index - 1 + SLIDES.length) % SLIDES.length,
      (index + 1) % SLIDES.length,
    ];
    adjacent.forEach((i) => {
      const video = container.querySelector<HTMLVideoElement>(
        `.slick-slide[data-index="${i}"]:not(.slick-cloned) video`,
      );
      if (video && video.preload !== "auto") {
        video.preload = "auto";
      }
    });
  }, []);

  // Initial play when entered view
  useEffect(() => {
    if (!hasEnteredView) return;

    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const activeVideo = container.querySelector<HTMLVideoElement>(
        `.slick-slide.slick-active:not(.slick-cloned) video`,
      );
      playVideo(activeVideo);
      preloadAdjacentSlides(0);
    }, 100);

    return () => clearTimeout(timer);
  }, [hasEnteredView, preloadAdjacentSlides]);

  const handleAfterChange = useCallback(
    (index: number) => {
      activeSlideRef.current = index;
      setActiveSlideIndex(index);
      const container = containerRef.current;
      if (!container) return;

      // Pause all videos first
      container.querySelectorAll("video").forEach((v) => {
        if (!v.paused) v.pause();
      });

      // Play the video in the currently active slide
      const activeVideo = container.querySelector<HTMLVideoElement>(
        `.slick-slide.slick-active:not(.slick-cloned) video`,
      );

      if (activeVideo) {
        const slide = SLIDES[index];
        if (activeVideo.currentTime === 0 && slide.videoStartTime) {
          activeVideo.currentTime = slide.videoStartTime;
        }
        playVideo(activeVideo);
      }

      preloadAdjacentSlides(index);
    },
    [preloadAdjacentSlides],
  );

  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    afterChange: handleAfterChange,
    lazyLoad: "progressive" as const,
  };

  const activeSlide = SLIDES[activeSlideIndex];

  const controls = (
    <>
      {/* Explore button */}
      <div className="pointer-events-auto shadow-lg rounded-full ring-2 ring-white/50">
        <ButtonV4
          color={activeSlide.buttonVariant}
          size="md"
          asChild
          className="w-[200px] md:w-[240px]"
        >
          <Link to={activeSlide.link}>
            {activeSlide.buttonPrefix}
            <span className="font-semibold ml-1">
              {activeSlide.projectName}
            </span>
          </Link>
        </ButtonV4>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          onClick={() => sliderRef.current?.slickPrev()}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-black/50 border border-white/60 backdrop-blur-xl hover:bg-black/70 transition-colors drop-shadow-lg"
          aria-label="Previous slide"
        >
          <ChevronLeftIcon className="w-6 h-6 text-white" />
        </button>

        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            onClick={() => sliderRef.current?.slickGoTo(i)}
            className={`rounded-full transition-all duration-300 drop-shadow-lg bg-white ring-1 ring-black/60 ${
              i === activeSlideIndex ? "w-5 h-2" : "w-2 h-2 hover:opacity-90"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}

        <button
          onClick={() => sliderRef.current?.slickNext()}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-black/50 border border-white/60 backdrop-blur-xl hover:bg-black/70 transition-colors drop-shadow-lg"
          aria-label="Next slide"
        >
          <ChevronRightIcon className="w-6 h-6 text-white" />
        </button>
      </div>
    </>
  );

  return (
    <SectionLayout
      maxWidth="9xl"
      className="bg-nasun-black overflow-hidden !px-0 !py-0 landscape:h-screen portrait:min-h-[calc(100vh_-_50px)]"
    >
      <div
        ref={containerRef}
        className="landscape:absolute landscape:inset-0 portrait:relative portrait:w-full portrait:flex portrait:flex-col portrait:h-[calc(100vh_-_50px)] portrait:justify-center"
      >
        <Slider
          ref={sliderRef}
          {...sliderSettings}
          className="w-full landscape:h-full landscape:[&_.slick-list]:h-full landscape:[&_.slick-track]:h-full landscape:[&_.slick-slide]:h-full landscape:[&_.slick-slide>div]:h-full"
        >
          {SLIDES.map((slide, idx) => (
            <div key={slide.id} className="landscape:h-full">
              <div
                className="relative w-full overflow-hidden landscape:h-full portrait:h-[50vh] portrait:max-h-[50vh]"
                style={{ backgroundColor: slide.bgColor }}
              >
                {slide.video && (
                  <video
                    key={
                      isMobile && slide.mobileVideo
                        ? `${slide.id}-mobile`
                        : slide.id
                    }
                    muted
                    playsInline
                    autoPlay={idx === 0}
                    preload={idx === 0 ? "auto" : "metadata"}
                    poster={slide.poster}
                    onEnded={() => sliderRef.current?.slickNext()}
                    className="w-full h-full object-cover"
                  >
                    <source
                      src={
                        isMobile && slide.mobileVideo
                          ? slide.mobileVideo
                          : slide.video
                      }
                      type="video/mp4"
                    />
                  </video>
                )}
              </div>
            </div>
          ))}
        </Slider>

        {/* Landscape (desktop): overlay controls on video */}
        <div className="landscape:flex hidden absolute bottom-[15%] left-0 right-0 z-20 flex-col items-center gap-4 pointer-events-none">
          {controls}
        </div>

        {/* Portrait (tablet/mobile): controls below video */}
        <div className="portrait:flex hidden flex-col items-center gap-4 mt-6 px-4">
          {controls}
        </div>

        {/* Tablet-only scroll indicator, pinned to section bottom */}
        <div className="hidden md:flex lg:hidden absolute bottom-6 inset-x-0 z-30 justify-center pointer-events-none">
          <svg
            className="w-6 h-6 text-nasun-white/50 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhatWeBuild2026Section);
