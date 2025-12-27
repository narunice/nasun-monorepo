import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import farmHouse from "@/assets/gensol/farmHouse.webp"

const NarrativeWorld = () => {
  return (
    // Narrative World Buildling Section
    <section className="relative w-full h-[calc(100vh-64px)] overflow-hidden">
      <FadeIn>
        {/* Background image */}
        <div
          className="absolute inset-0 bg-center bg-no-repeat bg-cover"
          style={{
            backgroundImage: `url(${farmHouse})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        ></div>

        {/* Main heading */}
        <div className="absolute z-10 text-white left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 w-[80%] text-center">
          <FadeInUp>
            <h2 className="font-semibold">ANIMATION SERIES</h2>
          </FadeInUp>
        </div>
      </FadeIn>
    </section>
  )
}
export default NarrativeWorld
