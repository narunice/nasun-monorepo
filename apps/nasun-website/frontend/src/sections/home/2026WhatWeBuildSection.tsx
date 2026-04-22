import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SectionLayout } from "@/components/layout/SectionLayout";

const gensolVideo = "/videos/Color-Trailer-No-Symbol-16x9-web.mp4";
const baramVideo = "/videos/Baram-Ui-rf28.mp4";
const baramVideoMobile = "/videos/Baram-Ui-mobile-rf28.mp4";
const padoVideo = "/videos/Pado-Ui-Short-rf28.mp4";
const padoVideoMobile = "/videos/Pado-Ui-Short-mobile-rf28.mp4";
const explorerVideo = "/videos/Network-Explorer-Ui-rf28.mp4";
const explorerVideoMobile = "/videos/Network-Explorer-Ui-mobile-rf28.mp4";

type SlideData = {
  id: string;
  bgColor: string;
  buttonPrefix: string;
  projectName: string;
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
    link: "/ecosystem/gensol",
    video: gensolVideo,
    poster: "/images/posters/Trakker-Flying-rf28.webp",
  },
  {
    id: "baram",
    bgColor: "#0b1120",
    buttonPrefix: "EXPLORE",
    projectName: "BARAM",
    link: "/ecosystem/baram",
    video: baramVideo,
    mobileVideo: baramVideoMobile,
    poster: "/images/posters/Baram-Ui-rf28.webp",
  },
  {
    id: "pado",
    bgColor: "#0b1120",
    buttonPrefix: "EXPLORE",
    projectName: "PADO",
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

  return (
    <SectionLayout
      maxWidth="9xl"
      className="bg-black overflow-hidden !px-0 !py-0 h-screen"
    >
      <div ref={containerRef} className="absolute inset-0">
        <Slider
          ref={sliderRef}
          {...sliderSettings}
          className="w-full h-full [&_.slick-list]:h-full [&_.slick-track]:h-full [&_.slick-slide]:h-full [&_.slick-slide>div]:h-full"
        >
          {SLIDES.map((slide, idx) => (
            <div key={slide.id} className="h-full">
              <div
                className="relative w-full h-full overflow-hidden"
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

        <div className="absolute bottom-[20%] left-0 right-0 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-56 flex flex-col items-center rounded-2xl bg-black/50 border border-white/15 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Explore link */}
            <Link
              to={activeSlide.link}
              className="flex items-center gap-2.5 px-8 py-3 w-full justify-center group hover:bg-white/5 transition-colors"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/45 group-hover:text-white/60 transition-colors">
                Explore
              </span>
              <span className="text-sm font-bold uppercase tracking-widest text-white">
                {activeSlide.projectName}
              </span>
            </Link>

            {/* Divider */}
            <span className="w-full h-px bg-white/10" />

            {/* Navigation row */}
            <div className="flex items-center">
              <button
                onClick={() => sliderRef.current?.slickPrev()}
                className="flex items-center justify-center w-10 h-10 shrink-0 hover:bg-white/10 transition-colors"
                aria-label="Previous slide"
              >
                <ChevronLeftIcon className="w-4 h-4 text-white/70" />
              </button>

              <span className="w-px h-4 bg-white/15 shrink-0" />

              <div className="flex items-center gap-2 px-4">
                {SLIDES.map((slide, i) => (
                  <button
                    key={slide.id}
                    onClick={() => sliderRef.current?.slickGoTo(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === activeSlideIndex
                        ? "w-5 h-2 bg-white"
                        : "w-2 h-2 bg-white/35 hover:bg-white/60"
                    }`}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>

              <span className="w-px h-4 bg-white/15 shrink-0" />

              <button
                onClick={() => sliderRef.current?.slickNext()}
                className="flex items-center justify-center w-10 h-10 shrink-0 hover:bg-white/10 transition-colors"
                aria-label="Next slide"
              >
                <ChevronRightIcon className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhatWeBuild2026Section);
