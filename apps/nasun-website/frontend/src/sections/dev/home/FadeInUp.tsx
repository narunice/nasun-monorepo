import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  durationMs?: number;
  translateY?: number;
  as?: "div" | "section" | "ul" | "li" | "p" | "h2" | "h3";
};

export default function FadeInUp({
  children,
  className = "",
  delayMs = 0,
  durationMs = 1200,
  translateY = 14,
  as: Tag = "div",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = {
    transform: visible ? "translate3d(0,0,0)" : `translate3d(0,${translateY}px,0)`,
    opacity: visible ? 1 : 0,
    transition: `transform ${durationMs}ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms, opacity ${durationMs}ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms`,
    willChange: "transform, opacity",
  };

  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  );
}
