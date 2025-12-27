import { AutoPlayVideo } from "@/components/common/AutoPlayVideo"
import GameplayWeb from "@/assets/videos/Gameplay-Lavaplanet-rf28.mp4"

const GamePlay = () => {
  return (
    <section>
      <div className="py-8 px-6 lg:py-0 lg:px-0">
        <AutoPlayVideo
          videoSrc={GameplayWeb}
          videoType="video/mp4"
          threshold={0.4}
          volume={0.4}
          className=""
        />
      </div>
    </section>
  )
}
export default GamePlay
