// <MONOREPO>/apps/gensol-website/frontend/src/app/films/HeroSection.tsx

import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import { gamesContent } from "@/constants/pageContent/gamesContent"
import RobotArena from "@/assets/gensol/RobotArena.webp"

const GamesHeroSection = () => {
  return (
    <>
      {/* Full-screen image container */}
      <section className="relative w-full h-[calc(100vh-64px)] overflow-hidden">
        <FadeIn>
          <div
            className="absolute inset-0 bg-center bg-no-repeat bg-cover"
            style={{
              backgroundImage: `url(${RobotArena})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          ></div>

          <div className="absolute z-10 w-full text-white top-[70%] text-center">
            <FadeInUp>
              <h1>{gamesContent.hero.title}</h1>
            </FadeInUp>
          </div>
          <div className="absolute z-10 text-white right-[2%] bottom-[2%]">
            <h6 className="opacity-60">{gamesContent.hero.credit}</h6>
          </div>
        </FadeIn>
      </section>
    </>
  )
}

export default GamesHeroSection
