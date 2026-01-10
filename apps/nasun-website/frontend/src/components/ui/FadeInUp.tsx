import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  delay?: string;
};

export const FadeInUp = ({ children, className = "", delay = "0.1s" }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          el.classList.add("animate-fadeInUp");
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} opacity-0 translate-y-[8px]`}
      style={{
        willChange: "opacity, transform",
        animationDelay: delay,
      }}
    >
      {children}
    </div>
  );
};
