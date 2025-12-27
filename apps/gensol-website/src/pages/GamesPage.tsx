import GamesHeroSection from "@/app/games/HeroSection"
import BackdropSection from "@/app/games/BackdropSection"
import GamePlanSection from "@/app/games/GamePlanSection"
import EscapeKramokSection from "@/app/games/EscapeKramok"
import BattleForSpectra from "@/app/games/BattleForSpectra"

const GamesPage = () => {
  return (
    <main className="relative w-full">
      <GamesHeroSection />
      <BackdropSection />
      <GamePlanSection />
      <BattleForSpectra />
      <EscapeKramokSection />
    </main>
  )
}

export default GamesPage
