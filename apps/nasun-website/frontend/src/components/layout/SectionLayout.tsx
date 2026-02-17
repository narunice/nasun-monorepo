import React from "react";
import { Title } from "../ui/Title";

const MAX_WIDTH_MAP = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  "8xl": "max-w-8xl",
  "9xl": "max-w-9xl",
} as const;

export const SectionLayout = React.forwardRef<
  HTMLElement,
  {
    title?: string;
    titleAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    titleClassName?: string;
    titleColor?: string;
    titleAlign?: "center" | "left";
    maxWidth?: keyof typeof MAX_WIDTH_MAP;
    children: React.ReactNode;
    className?: string;
  } & React.HTMLAttributes<HTMLElement>
>(
  (
    {
      title,
      titleAs = "h2",
      titleClassName = "",
      titleColor,
      titleAlign = "left",
      maxWidth = "9xl",
      children,
      className = "",
      ...rest
    },
    ref
  ) => (
    <section
      ref={ref}
      className={`w-full ${MAX_WIDTH_MAP[maxWidth]} h-full relative flex flex-col mx-auto items-center justify-center px-8 md:px-12 lg:px-16 xl:px-20 py-4 md:py-6 lg:py-8 xl:py-10 ${className}`}
      {...rest}
    >
      <div className="w-full">
        {title && (
          <Title as={titleAs} align={titleAlign} className={titleClassName} textColor={titleColor}>
            {title}
          </Title>
        )}
        {children}
      </div>
    </section>
  )
);

SectionLayout.displayName = "SectionLayout";
