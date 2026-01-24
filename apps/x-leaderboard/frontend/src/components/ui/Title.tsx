import React from "react";

interface TitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children?: React.ReactNode;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  align?: "center" | "left";
  className?: string;
  textColor?: string;
}

export const Title: React.FC<TitleProps> = ({
  children,
  as: Component = "h1",
  align = "center",
  className = "",
  textColor = "text-nasun-white",
  ...props
}) => {
  const alignmentClass = align === "center" ? "text-center" : "text-left";

  return (
    <Component
      className={`!font-rubik mb-1 md:mb-2 lg:mb-3 xl:mb-4 tracking-normal ${textColor} ${alignmentClass} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};

export default Title;
