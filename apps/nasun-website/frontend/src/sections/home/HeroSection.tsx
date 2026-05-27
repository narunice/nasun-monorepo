import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { InlineLoading } from "@/components/ui";
import { useIsMobile } from "@/hooks/useIsMobile";

const fullTrailerVideoDesktop = "/videos/Full-Trailer184s-rf24.mp4";
const fullTrailerVideoMobile = "/videos/Full-Trailer184s-mobile-rf28.mp4";

interface HeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

// 타입 정의
type ItemType = "text" | "image";

interface TimelineItem {
  id: string;
  type: ItemType;
  content: string;
  enterDur: number;
  exitDur: number;
  renderKey?: string; // 애니메이션 강제 리렌더링을 위한 고유 키
}

interface TimelineRange {
  id: string;
  start: number; // 시작 시간 (초)
  end: number; // 종료 시간 (초)
  item: TimelineItem;
}

// 타임라인 구간 정의 (초 단위)
// 각 구간은 [show time, hide time] 기준
const TIMELINE_RANGES: TimelineRange[] = [
  {
    id: "GAMES",
    start: 1.23,
    end: 2.93,
    item: { id: "GAMES", type: "text", content: "GAMES", enterDur: 0.3, exitDur: 0.3 },
  },
  {
    id: "FILMS",
    start: 4.06,
    end: 6.95,
    item: { id: "FILMS", type: "text", content: "FILMS", enterDur: 0.26, exitDur: 0.3 },
  },
  {
    id: "FINANCE",
    start: 8.68,
    end: 10.98,
    item: { id: "FINANCE", type: "text", content: "FINANCE", enterDur: 0.3, exitDur: 0.36 },
  },
  {
    id: "AI",
    start: 12.0,
    end: 14.16,
    item: { id: "AI", type: "text", content: "AI", enterDur: 0.3, exitDur: 0.3 },
  },
  {
    id: "LOGO",
    start: 15.99,
    end: 18.0,
    item: {
      id: "LOGO",
      type: "text",
      content: "NASUN",
      enterDur: 0.26,
      exitDur: 0.3,
    },
  },
];

const animVariants: Variants = {
  initial: { scale: 15, opacity: 0 },
  enter: (item: TimelineItem | null) => ({
    scale: 1,
    opacity: 1,
    transition: { duration: item?.enterDur || 0.5, ease: "circOut" },
  }),
  exit: (item: TimelineItem | null) => ({
    // 모든 아이템(텍스트 및 이미지) 동일하게 줌아웃하며 사라짐
    scale: 0,
    opacity: 0,
    transition: { duration: item?.exitDur || 0.5 },
  }),
};

function HeroSectionV3({ onVideoReady }: HeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [activeItem, setActiveItem] = useState<TimelineItem | null>(null);
  const [areImagesReady, setAreImagesReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const isMobile = useIsMobile();

  // 로고 이미지 프리로드 (심볼만)
  useEffect(() => {
    const symbolImg = new Image();

    symbolImg.onload = () => {
      setAreImagesReady(true);
    };

    symbolImg.src = "/nasun_symbol_white.svg";
  }, []);

  // 비디오가 재생 가능할 때
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 비디오가 실제로 재생 시작될 때
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  // 동기화 루프 (Reaction-based Sync)
  useEffect(() => {
    if (!isVideoPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const syncLoop = () => {
      if (videoRef.current) {
        const currentTime = videoRef.current.currentTime;

        // 현재 시간에 해당하는 아이템 찾기
        const currentRange = TIMELINE_RANGES.find(
          (range) => currentTime >= range.start && currentTime < range.end,
        );

        // 상태 업데이트 (불필요한 렌더링 방지)
        setActiveItem((prev) => {
          if (currentRange) {
            // 새 아이템이 있거나, 기존 아이템과 다를 경우 업데이트
            if (prev?.id === currentRange.item.id) {
              return prev;
            }
            return currentRange.item;
          } else {
            // 구간에 해당하지 않으면 null (exit 애니메이션 트리거)
            return prev === null ? null : null;
          }
        });
      }
      rafRef.current = requestAnimationFrame(syncLoop);
    };

    rafRef.current = requestAnimationFrame(syncLoop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isVideoPlaying]);

  useEffect(() => {
    // 타임아웃으로 최대 대기 시간 설정 (5초)
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  const videoSrc = isMobile ? fullTrailerVideoMobile : fullTrailerVideoDesktop;

  return (
    <div className="w-full relative h-screen overflow-hidden flex items-center justify-center bg-nasun-black">
      {/* Poster image — always visible as LCP element while video loads */}
      <img
        src="/images/posters/Full-Trailer184s-rf28.webp"
        alt="Nasun"
        fetchPriority="high"
        width={1920}
        height={1080}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Background video — fades in over the poster once playing.
          On mobile: preload="metadata" to save bandwidth for critical resources. */}
      <video
        ref={videoRef}
        key={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          isVideoPlaying ? "opacity-100" : "opacity-0"
        }`}
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
      >
        <source src={videoSrc} type="video/mp4" />
      </video>

      {/* 텍스트/이미지 애니메이션 오버레이 */}
      {isVideoPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-[28vh] z-30 pointer-events-none">
          <AnimatePresence>
            {activeItem && (
              <motion.div
                key={activeItem.id} // 안정적인 키를 사용하여 불필요한 DOM 파괴 방지
                custom={activeItem}
                variants={animVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="flex items-center justify-center"
              >
                <h1 className={`text-nasun-white !font-changeling text-5xl md:text-6xl lg:text-7xl ${activeItem.id === "LOGO" ? "font-bold tracking-wider" : "tracking-wide"} text-center uppercase drop-shadow-lg`}>
                  {activeItem.content}
                </h1>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* NASUN 로고 오버레이 (심볼) - V2와 동일한 위치 */}
      {isVideoPlaying && areImagesReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 md:gap-10 z-10 pt-[50px] -translate-y-[5vh] pointer-events-none">
          <img
            src="/nasun_symbol_white.svg"
            alt="NASUN Symbol"
            className="w-32 md:w-36 lg:w-40 xl:w-44"
          />
        </div>
      )}

      {/* Loading overlay — semi-transparent so poster image remains visible as LCP */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black/40 flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}
    </div>
  );
}

export default React.memo(HeroSectionV3);
