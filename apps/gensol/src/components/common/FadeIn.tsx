import { useEffect, useRef, useState } from "react"

type Props = {
  children: React.ReactNode
  className?: string
  delay?: string
  duration?: string
}

export const FadeIn = ({ children, className = "", delay = "0.1s", duration = "1.5s" }: Props) => {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(el)
        }
      },
      {
        threshold: 0.2, // 30% 진입 필요
        rootMargin: "0px 0px -15% 0px", // 하단 20% 여유 추가
      }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`opacity-0 ${isVisible ? "animate-fadeIn" : ""} ${className} `}
      style={{
        animationDelay: delay,
        animationDuration: duration,
      }}
    >
      {children}
    </div>
  )
}
