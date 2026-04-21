import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useIsMobile } from "@/hooks/useIsMobile";

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
    link: "/ip/gensol",
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

function WhatWeBuild2026Section({ videoCover = false }: { videoCover?: boolean }) {
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const doPauseClones = () => {
      container
        .querySelectorAll<HTMLVideoElement>(".slick-cloned video")
        .forEach((v) => {
          if (!v.paused) v.pause();
        });
    };
    const timer = setTimeout(doPauseClones, 100);
    const observer = new MutationObserver(doPauseClones);
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

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
      container
        .querySelectorAll<HTMLVideoElement>(".slick-cloned video")
        .forEach((v) => {
          if (!v.paused) v.pause();
        });
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
    <section className="relative w-full h-screen overflow-hidden bg-nasun-black">
      <div ref={containerRef} className="w-full h-full">
        <Slider ref={sliderRef} {...sliderSettings}>
          {SLIDES.map((slide) => (
            <div key={slide.id}>
              <div
                className="relative w-full h-screen overflow-hidden"
                style={{ backgroundColor: slide.bgColor }}
              >
                {slide.video && (
                  <video
                    key={
                      isMobile && slide.mobileVideo
                        ? `${slide.id}-mobile`
                        : slide.id
                    }
                    ref={(el) => {
                      if (!el) return;
                      if (slide.videoStartTime && el.currentTime === 0) {
                        el.currentTime = slide.videoStartTime;
                      }
                    }}
                    muted
                    playsInline
                    preload="none"
                    poster={slide.poster}
                    onEnded={(e) => {
                      const slideEl = e.currentTarget.closest(".slick-slide");
                      if (slideEl?.classList.contains("slick-cloned")) return;
                      sliderRef.current?.slickNext();
                    }}
                    className={`absolute inset-0 w-full h-full ${videoCover ? "object-cover" : "object-contain object-top"}`}
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

        {/* Overlay: explore button + nav */}
        <div className="absolute bottom-12 left-0 right-0 z-20 flex flex-col items-center gap-6 pointer-events-none">
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
              className="flex items-center justify-center w-7 h-7 rounded-full border border-white/30 bg-black/40 hover:bg-black/70 hover:border-white/60 transition-all"
              aria-label="Previous slide"
            >
              <ChevronLeftIcon className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center gap-3">
              {SLIDES.map((slide, i) => (
                <button
                  key={slide.id}
                  onClick={() => sliderRef.current?.slickGoTo(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
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
              className="flex items-center justify-center w-7 h-7 rounded-full border border-white/30 bg-black/40 hover:bg-black/70 hover:border-white/60 transition-all"
              aria-label="Next slide"
            >
              <ChevronRightIcon className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default React.memo(WhatWeBuild2026Section);
