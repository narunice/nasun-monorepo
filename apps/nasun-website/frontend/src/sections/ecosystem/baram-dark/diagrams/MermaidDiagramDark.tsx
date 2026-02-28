import DOMPurify from "dompurify";

interface MermaidDiagramDarkProps {
  svg: string;
  alt: string;
  className?: string;
}

export function MermaidDiagramDark({ svg, alt, className }: MermaidDiagramDarkProps) {
  const sanitizedSvg = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
  });

  return (
    <div
      className={`overflow-auto bg-gray-100 rounded-lg border border-nasun-white/10 p-4 [&>svg]:w-full [&>svg]:h-auto ${className ?? ""}`}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  );
}
