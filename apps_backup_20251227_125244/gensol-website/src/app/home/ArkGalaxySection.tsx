import { useMemo } from "react"
import { FadeInUp } from "@/components/common/FadeInUp"
import StarsBkgd from "@/assets/images/Firefly_Reduce the number of stars moderately, keeping a balanced amount of visible stars._Cr 389210.webp"

const STARS_CONFIG = {
  count: 350,
  width: 3000,
  height: 960,
  depth: 300,
  speed: 20,
}

const generateStars = (count: number, width: number, height: number) => {
  const shadows: string[] = []
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width - width / 2
    const y = Math.random() * height - height / 2
    const lightness = 75 + Math.random() * 25
    shadows.push(`${x}px ${y}px hsl(90, 0%, ${lightness}%)`)
  }
  return shadows.join(", ")
}

const ArkGalaxySection = () => {
  const starsShadow = useMemo(
    () => generateStars(STARS_CONFIG.count, STARS_CONFIG.width, STARS_CONFIG.height),
    []
  )

  return (
    <section className="relative flex items-center justify-center w-full min-h-screen h-full overflow-hidden">
      {/* 배경 이미지 (가장 뒷 레이어) */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${StarsBkgd})`,
        }}
      />

      {/* 회전하는 배경 그라데이션 */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-70"
        style={{
          backgroundImage: "linear-gradient(200deg, #0660a1 30%, #a0053e 70%)",
          animation: "rotateBackground 30s linear infinite",
          transformOrigin: "center center",
        }}
      />

      {/* 3D Starfield */}
      <div className="absolute inset-0 overflow-hidden z-[1]" style={{ perspective: "340px" }}>
        <div
          className="stars"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "2px",
            height: "2px",
            borderRadius: "50%",
            boxShadow: starsShadow,
            animation: `fly ${STARS_CONFIG.speed}s linear infinite, fadeInOut ${STARS_CONFIG.speed}s ease-in-out infinite, blurEffect ${STARS_CONFIG.speed}s ease-in infinite`,
            transformStyle: "preserve-3d",
          }}
        />
        <div
          className="stars-layer"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "2px",
            height: "2px",
            borderRadius: "50%",
            boxShadow: starsShadow,
            transform: `translateZ(-${STARS_CONFIG.depth}px)`,
            animation: `fly ${STARS_CONFIG.speed}s linear infinite, fadeInOut ${STARS_CONFIG.speed}s ease-in-out infinite, blurEffect ${STARS_CONFIG.speed}s ease-in infinite`,
            animationDelay: `${STARS_CONFIG.speed * 0.25}s`,
            transformStyle: "preserve-3d",
          }}
        />
        <div
          className="stars-layer"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "2px",
            height: "2px",
            borderRadius: "50%",
            boxShadow: starsShadow,
            transform: `translateZ(-${STARS_CONFIG.depth * 2}px)`,
            animation: `fly ${STARS_CONFIG.speed}s linear infinite, fadeInOut ${STARS_CONFIG.speed}s ease-in-out infinite, blurEffect ${STARS_CONFIG.speed}s ease-in infinite`,
            animationDelay: `${STARS_CONFIG.speed * 0.5}s`,
            transformStyle: "preserve-3d",
          }}
        />
      </div>

      {/* 어두운 오버레이 (중앙이 어둡고 주변으로 투명해짐) */}
      <div
        className="absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      {/* 내용 컨테이너 */}
      <div className="relative z-10">
        <FadeInUp>
          <div className="w-full max-w-2xl px-6 py-12 text-center">
            <h4 className="font-pirulen text-white mb-4">GEN SOL GALAXY</h4>
            <p className="text-gray-300 leading-relaxed max-w-[530px] xl:max-w-[536px] mx-auto px-[69px] md:px-[42px] xl:px-4">
              From emperors of intergalactic civilizations to petty thieves, all are bound by one
              obsession: Spectra—the unholy fuel that drives all of the Gen Sol Galaxy. To possess
              enough is to command wealth, power and even the promise of eternal life.
            </p>
          </div>
        </FadeInUp>
      </div>

      {/* CSS 애니메이션 */}
      <style>{`
        @keyframes rotateBackground {
          0% { transform: scale(4.5) rotate(0deg); }
          100% { transform: scale(4.5) rotate(360deg); }
        }
        @keyframes fly {
          from { transform: translateZ(0px); }
          to { transform: translateZ(${STARS_CONFIG.depth}px); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; }
          15% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes blurEffect {
          0% { filter: blur(0px); }
          70% { filter: blur(1px); }
          100% { filter: blur(4px); }
        }
      `}</style>
    </section>
  )
}

export default ArkGalaxySection
