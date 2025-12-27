import { FC } from "react"

type TextProps = {
  text: string,
  isError?: boolean,
  centered?: boolean
}

export const EcText: FC<TextProps> = ({text, isError, centered}) => {

  const textColor = isError ? "text-red-500" : "text-gray-500";
  const centeredClassname = centered ? "text-center" : "";

  return <div className={`${centeredClassname} ${textColor}`}>{text}</div>

}