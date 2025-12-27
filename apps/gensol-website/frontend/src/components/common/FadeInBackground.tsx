// FadeInBackground.tsx
import { useEffect, useRef } from "react"

interface FadeInBackgroundProps {
  imageUrl: string
  className?: string
  delay?: string
  duration?: string
  maskImage?: string
  webkitMaskImage?: string
  backgroundSize?: string
  backgroundPosition?: string
}

export const FadeInBackground = ({
  imageUrl,
  className = "",
  delay = "0s",
  duration = "1.5s",
  maskImage = "",
  webkitMaskImage = "",
  backgroundSize = "cover",
  backgroundPosition = "center",
}: FadeInBackgroundProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.unobserve(el)
          el.style.opacity = "1"
          el.style.transition = `opacity ${duration} ease ${delay}`
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [delay, duration])

  return (
    <div
      ref={ref}
      className={`bg-center bg-no-repeat ${className}`}
      style={{
        opacity: 0,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize,
        backgroundPosition,
        maskImage,
        WebkitMaskImage: webkitMaskImage || maskImage,
        willChange: "opacity",
        transitionProperty: "opacity",
      }}
    />
  )
}
