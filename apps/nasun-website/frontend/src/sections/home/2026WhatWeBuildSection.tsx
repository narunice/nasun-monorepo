import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";

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
      if (video && video.preload === "none") {
        video.preload = "auto";
        video.load();
      }
    });
  }, []);

  useEffect(() => {
    if (!hasEnteredView) return;
    const container = containerRef.current;
    if (!container) return;
    const activeVideo = container.querySelector<HTMLVideoElement>(
      `.slick-slide[data-index="0"]:not(.slick-cloned) video`,
    );
    activeVideo?.play().catch(() => {});
    preloadAdjacentSlides(0);
  }, [hasEnteredView, preloadAdjacentSlides]);

  const syncAndPlayClones = useCallback((_current: number, next: number) => {
    const container = containerRef.current;
    if (!container) return;
    const nextSlide = SLIDES[next];
    const originalVideo = container.querySelector<HTMLVideoElement>(
      `.slick-slide[data-index="${next}"]:not(.slick-cloned) video`,
    );
    if (!originalVideo?.currentSrc) return;
    const clones = container.querySelectorAll<HTMLVideoElement>(
      ".slick-cloned video",
    );
    clones.forEach((clone) => {
      if (clone.currentSrc === originalVideo.currentSrc) {
        clone.currentTime = nextSlide?.videoStartTime ?? 0;
        clone.play().catch(() => {});
      }
    });
  }, []);

  const handleAfterChange = useCallback(
    (index: number) => {
      activeSlideRef.current = index;
      setActiveSlideIndex(index);
      const container = containerRef.current;
      if (!container) return;
      container
        .querySelectorAll<HTMLVideoElement>(
          ".slick-slide:not(.slick-cloned) video",
        )
        .forEach((v) => {
          if (!v.paused) v.pause();
        });
      const slide = SLIDES[index];
      const activeVideo = container.querySelector<HTMLVideoElement>(
        `.slick-slide[data-index="${index}"]:not(.slick-cloned) video`,
      );
      if (activeVideo) {
        activeVideo.currentTime = slide.videoStartTime ?? 0;
        activeVideo.play().catch(() => {});
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
    beforeChange: syncAndPlayClones,
    afterChange: handleAfterChange,
  };

  const activeSlide = SLIDES[activeSlideIndex];

  return (
    <SectionLayout
      maxWidth="9xl"
      className="!px-0 !py-0 bg-nasun-black overflow-hidden"
    >
      <div ref={containerRef} className="w-full flex flex-col">
        {/* Section Title Area: Independent block above video */}
        <div className="w-full py-10 md:py-14 lg:py-16 flex justify-center bg-nasun-black">
          <SectionTitle
            as="h2"
            className="!font-eurostile font-semibold uppercase"
          >
            What We're Building
          </SectionTitle>
        </div>

        {/* Video Slider Area: Positioned below title */}
        <div className="relative w-full aspect-video">
          <Slider ref={sliderRef} {...sliderSettings} className="w-full h-full">
            {SLIDES.map((slide) => (
              <div key={slide.id}>
                <div
                  className="relative w-full aspect-video overflow-hidden"
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
                      preload="none"
                      poster={slide.poster}
                      onEnded={() => sliderRef.current?.slickNext()}
                      className="w-full h-full object-contain"
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
        </div>

        {/* Controls Overlay/Below div */}
        <div
          className="
          relative py-10 flex flex-col items-center gap-6 bg-nasun-black
          lg:absolute lg:bottom-10 lg:left-0 lg:right-0 lg:z-20 lg:bg-transparent lg:pointer-events-none
        "
        >
          <ButtonV3
            size="md"
            outline
            asChild
            className="w-[200px] md:w-[240px] pointer-events-auto border-white/70 text-white bg-black/40 backdrop-blur-sm hover:bg-black/60 uppercase tracking-widest"
          >
            <Link to={activeSlide.link}>
              {activeSlide.buttonPrefix}
              <span className="font-semibold ml-1">
                {activeSlide.projectName}
              </span>
            </Link>
          </ButtonV3>

          <div className="flex items-center gap-4 pointer-events-auto">
            <button
              onClick={() => sliderRef.current?.slickPrev()}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-white/30 bg-black/40 hover:bg-black/70 hover:border-white/60 transition-all"
              aria-label="Previous slide"
            >
              <ChevronLeftIcon className="w-5 h-5 text-white" />
            </button>

            <div className="flex items-center gap-3">
              {SLIDES.map((slide, i) => (
                <button
                  key={slide.id}
                  onClick={() => sliderRef.current?.slickGoTo(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    i === activeSlideIndex
                      ? "bg-nasun-white"
                      : "bg-nasun-white/40 hover:bg-nasun-white/60"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => sliderRef.current?.slickNext()}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-white/30 bg-black/40 hover:bg-black/70 hover:border-white/60 transition-all"
              aria-label="Next slide"
            >
              <ChevronRightIcon className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhatWeBuild2026Section);
