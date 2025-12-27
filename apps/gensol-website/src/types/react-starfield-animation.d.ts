declare module "react-starfield-animation" {
  import { CSSProperties, FC } from "react"

  interface StarfieldAnimationProps {
    numParticles?: number
    lineWidth?: number
    alphaFactor?: number
    depth?: number
    style?: CSSProperties
  }

  const StarfieldAnimation: FC<StarfieldAnimationProps>
  export default StarfieldAnimation
}
