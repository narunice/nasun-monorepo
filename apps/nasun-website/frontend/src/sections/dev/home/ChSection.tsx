import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  fullMinHeight?: boolean;
};

export default function ChSection({
  children,
  className = "",
  innerClassName = "",
  fullMinHeight = true,
}: Props) {
  // When the section is forced to fill the viewport, center the content
  // vertically so any unavoidable slack splits evenly between top and
  // bottom — adjacent section padding no longer compounds visually.
  const style: CSSProperties | undefined = fullMinHeight
    ? {
        minHeight: "calc(100vh - 50px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }
    : undefined;

  return (
    <section className={`ch-section ${className}`} style={style}>
      <div className={`ch-container ch-stack ${innerClassName}`}>{children}</div>
    </section>
  );
}
