import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV2 } from "@/components/ui/button-v2";
import gensolVideo from "../../assets/videos/Trakker-Flying-26rf.mp4";
import padoVideo from "../../assets/videos/Pado-Ui-Demo-Final-rf26.mp4";
import explorerVideo from "../../assets/videos/Explorer-Ui-Demo-rf15.mp4";

const CustomArrow = ({
  onClick,
  direction,
}: {
  onClick?: () => void;
  direction: "left" | "right";
}) => (
  <button
    onClick={onClick}
    className={`hidden lg:block absolute top-1/2 z-10 -translate-y-1/2 bg-nasun-black/80 p-3 rounded-full shadow-lg hover:bg-nasun-black/60 transition-all border border-nasun-white/30 hover:border-white/50 ${
      direction === "left" ? "-left-14 xl:-left-16" : "-right-14 xl:-right-16"
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
  buttonVariant: "red" | "blue" | "white" | "purple" | "gensol-red";
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
    buttonVariant: "gensol-red",
    link: "/ip/gensol",
    video: gensolVideo,
    contentPosition: "right-center",
  },
  {
    id: "baram",
    bgColor: "#f0ebe3",
    buttonPrefix: "EXPLORE",
    projectName: "BARAM",
    buttonVariant: "blue",
    link: "/baram",
  },
  {
    id: "pado",
    bgColor: "#0f4f4f",
    buttonPrefix: "EXPLORE",
    projectName: "PADO",
    buttonVariant: "white",
    link: "/pado-new",
    video: padoVideo,
    videoStartTime: 27,
  },
  {
    id: "protocol",
    bgColor: "#1a2744",
    buttonPrefix: "EXPLORE",
    projectName: "NASUN",
    buttonVariant: "purple",
    link: "/about/strategy",
    video: explorerVideo,
  },
];

function WhatWeBuildingSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEnteredView, setHasEnteredView] = useState(false);

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

  // Play original (non-cloned) videos once section is in view
  useEffect(() => {
    if (!hasEnteredView) return;
    const container = containerRef.current;
    if (!container) return;

    container
      .querySelectorAll<HTMLVideoElement>(".slick-slide:not(.slick-cloned) video")
      .forEach((v) => v.play().catch(() => {}));
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

  // Before transition: sync clone currentTime to original and start playback.
  // Setting currentTime on a paused video completes synchronously for buffered regions.
  const syncAndPlayClones = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const originals = container.querySelectorAll<HTMLVideoElement>(
      ".slick-slide:not(.slick-cloned) video",
    );
    const clones = container.querySelectorAll<HTMLVideoElement>(".slick-cloned video");
    clones.forEach((clone) => {
      originals.forEach((original) => {
        if (clone.currentSrc && clone.currentSrc === original.currentSrc) {
          clone.currentTime = original.currentTime;
          clone.play().catch(() => {});
        }
      });
    });
  }, []);

  // After transition: pause clones again for next cycle
  const pauseClones = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLVideoElement>(".slick-cloned video").forEach((v) => {
      if (!v.paused) v.pause();
    });
  }, []);

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 10000,
    arrows: true,
    prevArrow: <CustomArrow direction="left" />,
    nextArrow: <CustomArrow direction="right" />,
    beforeChange: syncAndPlayClones,
    afterChange: pauseClones,
  };

  return (
    <SectionLayout className="relative min-h-screen bg-nasun-black overflow-hidden !justify-start">
      <div className="relative z-10 flex flex-col items-center pt-[max(4.5rem,8vh)] pb-16 md:pb-20 lg:pb-24 px-4 md:px-8">
        {/* Section Title */}
        <FadeInUp>
          <SectionTitle
            as="h2"
            color="white"
            className="!font-eurostile text-center !mb-6 md:!mb-8 lg:!mb-10 uppercase"
          >
            What We're Building
          </SectionTitle>
        </FadeInUp>

        {/* Carousel Card */}
        <FadeInUp delay="0.2s">
          <div
            ref={containerRef}
            className={[
              "relative w-full max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-0 lg:px-16 xl:px-20",
              "[&_.slick-dots]:!relative [&_.slick-dots]:!bottom-auto [&_.slick-dots]:!mt-6",
              "[&_.slick-dots_li_button:before]:!text-white/40",
              "[&_.slick-dots_li.slick-active_button:before]:!text-white",
            ].join(" ")}
          >
            <Slider {...sliderSettings}>
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
                        loop={!slide.videoStartTime}
                        muted
                        playsInline
                        preload="auto"
                        onEnded={
                          slide.videoStartTime
                            ? (e) => {
                                const v = e.currentTarget;
                                v.currentTime = slide.videoStartTime!;
                                v.play();
                              }
                            : undefined
                        }
                        className={`absolute inset-0 w-full h-full object-cover ${slide.id === "pado" ? "object-top" : ""}`}
                      >
                        <source src={slide.video} type="video/mp4" />
                      </video>
                    )}

                    {/* Dark overlay for readability */}
                    {/* {slide.video && <div className="absolute inset-0 bg-black/30" />} */}

                    {/* Content */}
                    <div
                      className={`relative z-10 flex flex-col h-full px-6 md:px-12 lg:px-16 ${
                        slide.contentPosition === "right-center"
                          ? "items-center justify-end pr-8 md:pr-16 lg:pr-20 pb-10 md:pb-14 lg:pb-16"
                          : "items-center justify-end pb-10 md:pb-14 lg:pb-16"
                      }`}
                    >
                      <ButtonV2
                        variant={slide.buttonVariant}
                        size="md"
                        asChild
                        className={`w-[200px] md:w-[240px] ${slide.id === "gensol" ? "from-[#d5293399] to-[#e85a6299] hover:from-[#c0242d99] hover:to-[#d54a5299]" : ""}`}
                      >
                        <Link to={slide.link}>
                          {slide.buttonPrefix}
                          <span className="font-medium ml-1">{slide.projectName}</span>
                        </Link>
                      </ButtonV2>
                    </div>
                  </div>
                </div>
              ))}
            </Slider>
          </div>
        </FadeInUp>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhatWeBuildingSection);
