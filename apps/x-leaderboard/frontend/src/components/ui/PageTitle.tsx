import React from "react";

export interface PageTitleProps {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  align?: "center" | "left";
  className?: string;
  textColor?: string;
}

export const PageTitle: React.FC<PageTitleProps> = ({
  children,
  as: Component = "h2",
  align = "center",
  className = "",
  textColor = "text-nasun-white",
}) => {
  const alignmentClass = align === "center" ? "text-center" : "text-left";

  return (
    <div className="flex flex-col mt-12 mb-6 md:mb-8 lg:mb-10 xl:mb-12">
      <Component
        className={`${alignmentClass} uppercase font-medium ${textColor} ${className}`.trim()}
      >
        {children}
      </Component>
    </div>
  );
};
