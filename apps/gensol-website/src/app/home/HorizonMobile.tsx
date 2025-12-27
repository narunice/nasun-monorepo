import { useEffect, useRef, useState } from "react"
import { homeContent } from "../../constants/pageContent/homeContent.ts"
import "../../style/homePage.css"
import PulsePoint from "../../components/common/PulsePoint" // PulsePoint 컴포넌트 분리
import { FadeIn } from "@/components/common/FadeIn.tsx"
import { FadeInUp } from "@/components/common/FadeInUp.tsx"
import RifleTurningVertical from "@/assets/videos/RifleTurningVertical.webm" // 비디오 경로 수정

const MobileHorizonSection = () => {
  const [activeTags, setActiveTags] = useState<boolean[]>([])
  const [shownTags, setShownTags] = useState<boolean[]>([])
  const [lineAnimated, setLineAnimated] = useState(false)
  const tagsRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentTagsRef = tagsRef.current
    const currentLineRef = lineRef.current

    // 초기 상태 설정
    const tagCount = Object.keys(homeContent.horizon).filter((key) => key.startsWith("tag")).length
    setActiveTags(Array(tagCount).fill(false))
    setShownTags(Array(tagCount).fill(false))

    // 라인 애니메이션 Observer
    const lineObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !lineAnimated) {
          setLineAnimated(true)
        }
      },
      { threshold: 0.1 }
    )

    // 태그 애니메이션 Observer
    const tagObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const delays = Array.from({ length: tagCount }, (_, i) => i * 1500)

          delays.forEach((delay, index) => {
            setTimeout(() => {
              setActiveTags((prev) => [...prev].map((v, i) => (i === index ? true : v)))
              setShownTags((prev) => [...prev].map((v, i) => (i === index ? true : v)))
            }, delay)
          })

          tagObserver.unobserve(entry.target)
        }
      },
      { threshold: 0.1 }
    )

    if (currentTagsRef) tagObserver.observe(currentTagsRef)
    if (currentLineRef) lineObserver.observe(currentLineRef)

    return () => {
      if (currentTagsRef) tagObserver.unobserve(currentTagsRef)
      if (currentLineRef) lineObserver.unobserve(currentLineRef)
    }
  }, [lineAnimated])

  return (
    <section className="relative w-full h-full overflow-hidden">
      <FadeIn>
        {/* 배경 비디오 */}
        <video autoPlay loop muted playsInline className="relative w-full h-full object-cover">
          <source src={RifleTurningVertical} type="video/webm" />
        </video>
      </FadeIn>

      {/* 오버레이 배경 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 15%, rgba(0, 0, 0, 0) 85%, rgba(0, 0, 0, 1) 100%)",
        }}
      />

      {/* 제목 */}
      <div className="absolute top-[10%] left-1/2 transform -translate-x-1/2 flex flex-nowrap justify-around z-10 w-full px-4">
        <FadeInUp>
          <h3>{homeContent.horizon.title}</h3>
        </FadeInUp>
      </div>

      {/* 태그 영역 */}
      <div
        ref={tagsRef}
        className="absolute right-0 top-[17%] left-[60%] bottom-0 h-[70%] justify-around w-1/2 flex flex-col items-start pr-4"
      >
        {/* 세로 라인 애니메이션 */}
        <div
          ref={lineRef}
          className="absolute -left-2 top-[5.8%] h-0 border-l-1 border-sf-red"
          style={{
            height: lineAnimated ? "86.2%" : "0%",
            transition: lineAnimated ? "height 10s linear 0.4s" : "none",
            transformOrigin: "top center",
          }}
        />

        {Object.entries(homeContent.horizon)
          .filter(([key]) => key.startsWith("tag"))
          .map(([key, tag], index) => (
            <div
              key={key}
              className={`relative flex items-center pl-6 py-2 whitespace-pre-line text-left transition-opacity duration-1500 ${
                activeTags[index] ? "opacity-100" : "opacity-0"
              }`}
            >
              {shownTags[index] && (
                <div className="absolute -left-2">
                  <PulsePoint />
                </div>
              )}
              <div
                className={`text-white ${key === "tag2" || key === "tag4" ? "max-w-[160px]" : ""}`}
              >
                {tag}
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}

export default MobileHorizonSection
