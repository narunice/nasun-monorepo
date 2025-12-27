// components/AutoPlayVideo.tsx
import { useRef, useEffect, useState } from "react"

interface AutoPlayVideoProps {
  videoSrc: string
  videoType?: string
  threshold?: number
  volume?: number
  className?: string
  loop?: boolean
  muted?: boolean
  controls?: boolean
  showControlsOnHover?: boolean
}

export const AutoPlayVideo = ({
  videoSrc,
  videoType = "video/webm",
  threshold = 0.4,
  volume = 0.5,
  className = "",
  loop = false,
  muted = false,
  controls = true,
  showControlsOnHover = false,
}: AutoPlayVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // 볼륨 설정 (브라우저 정책에 따라 작동하지 않을 수 있음)
    try {
      video.volume = volume
    } catch (e) {
      console.log("Volume Set Failed:", e)
    }

    // Intersection Observer 설정
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch((e) => console.log("Autoplay Failed:", e))
          } else {
            video.pause()
          }
        })
      },
      { threshold }
    )

    observer.observe(video)

    return () => observer.disconnect()
  }, [threshold, volume])

  return (
    <section className={`w-full h-auto ${className}`}>
      <video
        ref={videoRef}
        controls={showControlsOnHover ? isHovered : controls}
        muted={muted}
        loop={loop}
        className="w-full h-auto mx-auto"
        style={{ display: "block", backgroundColor: "#000" }}
        playsInline
        preload="metadata"
        onMouseEnter={() => showControlsOnHover && setIsHovered(true)}
        onMouseLeave={() => showControlsOnHover && setIsHovered(false)}
      >
        <source src={videoSrc} type={videoType} />
        Your browser does not support the video tag.
      </video>
    </section>
  )
}
