import type { ReactNode } from "react";

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
  return (
    <section
      className={`ch-section ${className}`}
      style={fullMinHeight ? { minHeight: "calc(100vh - 50px)" } : undefined}
    >
      <div className={`ch-container ch-stack ${innerClassName}`}>{children}</div>
    </section>
  );
}
