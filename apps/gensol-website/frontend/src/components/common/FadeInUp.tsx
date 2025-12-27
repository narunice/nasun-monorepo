import { useEffect, useRef } from "react"

type Props = {
  children: React.ReactNode
  className?: string
  delay?: string // 추가: 개별 요소에 delay 조절 가능
}

export const FadeInUp = ({
  children,
  className = "",
  delay = "0.0s", // 기본값 설정
}: Props) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 초기 상태 설정 (Tailwind 클래스로 대체 가능)
    el.style.opacity = "0"
    el.style.transform = "translateY(10px)"

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target)

          // 애니메이션 클래스 추가
          el.classList.add(
            "animate-fadeInUp",
            "opacity-0", // 초기 상태를 Tailwind 클래스로 설정
            "translate-y-[10px]" // 초기 상태를 Tailwind 클래스로 설정
          )

          // 인라인 스타일 제거 (Tailwind 클래스 사용 시)
          el.style.opacity = ""
          el.style.transform = ""
        }
      },
      { threshold: 0.2 } // 요소의 20%가 보일 때 트리거
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${className} opacity-0 translate-y-[10px]`} // 초기 상태를 클래스로 설정
      style={{
        willChange: "opacity, transform",
        animationDelay: delay, // 개별 delay 적용
      }}
    >
      {children}
    </div>
  )
}
