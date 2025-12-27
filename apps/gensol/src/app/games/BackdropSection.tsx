import { FadeInUp } from "@/components/common/FadeInUp"
import { gamesContent } from "@/constants/pageContent/gamesContent"

const BackdropSection = () => {
  // 별 색상 팔레트 (흰색~푸른 계열)
  const starColors = [
    "#F0F8FF", // 알리스터 블루
    "#E6F0FF", // 연한 하늘색
    "#B5D0FF", // 밝은 파랑
    "#A5F2F3", // 청록
    "#D4EFFF", // 밝은 하늘색
  ]

  // 별 생성 함수
  const generateStars = (count: number, sizeRange: { min: number; max: number }) => {
    return Array.from({ length: count }).map((_, i) => {
      const style = {
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        width: `${Math.random() * (sizeRange.max - sizeRange.min) + sizeRange.min}px`,
        height: `${Math.random() * (sizeRange.max - sizeRange.min) + sizeRange.min}px`,
        opacity: 0,
        backgroundColor: starColors[Math.floor(Math.random() * starColors.length)],
        animation: `gentleTwinkle ${Math.random() * 10 + 10}s infinite ease-in-out ${
          Math.random() * 5
        }s`,
      }
      return <div key={i} className="absolute rounded-full" style={style} />
    })
  }
  return (
    <section className="relative flex items-center justify-center w-full h-full lg:h-[calc(100vh-64px)] min-h-[500px] overflow-hidden">
      {/* 회전하는 배경 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "linear-gradient(200deg, #0660a1 30%, #a0053e 70%)",
          transform: "scale(4.5)",
          animation: "rotateBackground 110s linear infinite",
          transformOrigin: "center center",
        }}
      />

      {/* 첫 번째 별 그룹 (20개) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          animation: "rotateStars 300s linear infinite",
          transformOrigin: "center center",
        }}
      >
        {generateStars(50, { min: 1, max: 15 })}
      </div>

      {/* 두 번째 별 그룹 (15개, 더 느림) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          animation: "rotateStars 460s linear infinite",
          transformOrigin: "center center",
        }}
      >
        {generateStars(40, { min: 0.5, max: 7 })}
      </div>

      {/* 어두운 오버레이 (중앙이 어둡고 주변으로 투명해짐) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* 내용 컨테이너 */}
      <FadeInUp>
        <div className="relative z-10 w-full max-w-2xl px-6 py-12 text-center">
          <h5 className="font-pirulen text-white mb-4">{gamesContent.backdrop.title}</h5>
          <p className="text-gray-300 leading-relaxed max-w-[440px] md:max-w-[510px] xl:max-w-xl mx-auto">
            {gamesContent.backdrop.description}
          </p>
        </div>
      </FadeInUp>

      {/* CSS 애니메이션 */}
      <style>{`
        @keyframes gentleTwinkle {
          0%, 100% { opacity: 0.1; transform: scale(1); filter: brightness(1); }
          50% { opacity: 0.8; transform: scale(1.3); filter: brightness(1.5); }
        }
        @keyframes rotateBackground {
          0% { transform: scale(4.5) rotate(0deg); }
          100% { transform: scale(4.5) rotate(360deg); }
        }
        @keyframes rotateStars {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
      `}</style>
    </section>
  )
}

export default BackdropSection
