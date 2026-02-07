import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import visionVideoPcMP4 from "../../assets/videos/home-vision-wave-light-desktop.mp4";
import visionVideoMobileMP4 from "../../assets/videos/home-vision-wave-light-mobile.mp4";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { SignUpModal } from "@/components/auth/SignUpModal";

interface VisionSectionV2Props {
  shouldLoadVideo?: boolean;
  onVideoReady?: () => void;
}

function VisionSectionV2({ shouldLoadVideo = false, onVideoReady }: VisionSectionV2Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isSignUpModalOpen, setIsSignUpModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  // Detect mobile device (< 1024px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const videoSrc = isMobile ? visionVideoMobileMP4 : visionVideoPcMP4;

  // Video autoplay handling for iOS
  useEffect(() => {
    if (!shouldLoadVideo) return;

    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.play().catch(() => {});
      onVideoReady?.();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (video.readyState >= 1) {
      video.play().catch(() => {});
      onVideoReady?.();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [shouldLoadVideo, onVideoReady]);

  // IntersectionObserver - play/pause based on visibility
  useEffect(() => {
    if (!shouldLoadVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;
          if (entry.isIntersecting) {
            video?.play().catch(() => {});
          } else {
            video?.pause();
          }
        });
      },
      { threshold: 0.1 },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [shouldLoadVideo]);

  return (
    <SectionLayout className="relative min-h-screen">
      {/* Background video container - full browser width */}
      <div
        ref={containerRef}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-full bg-nasun-white"
      >
        {shouldLoadVideo && (
          <video
            key={videoSrc}
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
            preload="auto"
            x-webkit-airplay="allow"
            onPlaying={handleVideoPlaying}
            className={`absolute top-0 left-0 w-full h-full object-cover object-center transition-opacity duration-500 ${
              isVideoPlaying ? "opacity-100" : "opacity-0"
            }`}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        )}
      </div>

      {/* Content */}
      <div className="relative z-30 flex flex-col lg:flex-row items-center justify-center min-h-screen px-4 lg:px-8 gap-6 lg:gap-12 xl:gap-16">
        {/* Left: Triangle Symbol */}
        <div className="w-full lg:w-2/5 flex items-center justify-center lg:justify-end pt-16 lg:pt-0">
          <FadeInUp delay="0.1s">
            <img
              src="/nasun_symbol_black.svg"
              alt="Nasun"
              className="w-40 md:w-56 lg:w-64 xl:w-80 opacity-50"
            />
          </FadeInUp>
        </div>

        {/* Right: Text Content */}
        <div className="w-full lg:w-3/5 flex flex-col items-center lg:items-start text-center lg:text-left gap-2 lg:gap-3">
          {/* NASUN Wordmark */}
          <FadeInUp delay="0.2s">
            <img
              src="/nasun-wordmark-black.svg"
              alt="NASUN"
              className="h-14 md:h-16 lg:h-20 xl:h-24 w-auto opacity-80 "
            />
          </FadeInUp>

          {/* COORDINATED CREATION */}
          <FadeInUp delay="0.3s">
            <h4 className="font-medium !text-nasun-black/85 -mt-4">COORDINATED CREATION</h4>
          </FadeInUp>

          {/* Categories */}
          <FadeInUp delay="0.4s">
            <p className="text-lg md:text-xl lg:text-2xl text-nasun-black/60 font-medium mt-4">
              Finance &bull; AI &bull; Games &bull; Film
            </p>
          </FadeInUp>

          {/* Description */}
          <FadeInUp delay="0.5s">
            <p className="text-base md:text-lg text-nasun-black/70 max-w-xl mt-2">
              Communities build, own, and grow valuable IP together
            </p>
          </FadeInUp>

          {/* CTA Buttons */}
          <FadeInUp delay="0.6s">
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mt-6 lg:mt-8">
              <button
                onClick={() => setIsSignUpModalOpen(true)}
                className="inline-flex items-center justify-center rounded-full px-12 py-2.5 text-base lg:text-lg font-medium text-white bg-gradient-to-r from-[#E8956A] to-[#D4736C] hover:from-[#D4836A] hover:to-[#C46862] active:scale-[0.97] transition-all cursor-pointer min-w-[180px]"
              >
                SIGN UP
              </button>
              <Link
                to="/about/strategy"
                className="inline-flex items-center justify-center rounded-full px-12 py-2.5 text-base lg:text-lg font-medium text-nasun-black/80 bg-[#A8C8E0] hover:bg-[#96BAD4] active:scale-[0.97] transition-all min-w-[180px]"
              >
                A UNIFIED VISION
              </Link>
            </div>
          </FadeInUp>
        </div>
      </div>

      {/* Bottom Tagline */}
      <div className="absolute bottom-6 lg:bottom-10 left-0 right-0 z-30 px-4">
        <FadeInUp delay="0.7s">
          <p className="font-medium text-lg/snug md:text-xl/snug xl:text-2xl/snug text-nasun-black/80 text-center max-w-4xl mx-auto">
            Building the next generation of global IP through coordinated creation.
          </p>
        </FadeInUp>
      </div>

      {/* Sign Up Modal */}
      <SignUpModal isOpen={isSignUpModalOpen} onClose={() => setIsSignUpModalOpen(false)} />
    </SectionLayout>
  );
}

export default React.memo(VisionSectionV2, (prev, next) => {
  return prev.shouldLoadVideo === next.shouldLoadVideo;
});
