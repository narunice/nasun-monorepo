// <MONOREPO>/apps/gensol-website/frontend/src/pages/FilmsPage.tsx

import FilmsHeroSection from "@/app/films/HeroSection"
import ConceptExecutionSection from "@/app/films/ConceptExecution"
import SpectraHeistSection from "@/app/films/SpectraHeist"
import HeirApparentSection from "@/app/films/HeirApparent"
import FeatureFilmSection from "@/app/films/FeatureFilm"
import NarrativeWorld from "@/app/films/NarrativeWorld"
import MysteriesRevealed from "@/app/films/MysteriesRevealed"

const FilmsPage = () => {
  return (
    <main className="relative w-full">
      <FilmsHeroSection />

      <ConceptExecutionSection />

      <NarrativeWorld />

      <SpectraHeistSection />

      <MysteriesRevealed />

      <HeirApparentSection />

      <FeatureFilmSection />
    </main>
  )
}

export default FilmsPage
