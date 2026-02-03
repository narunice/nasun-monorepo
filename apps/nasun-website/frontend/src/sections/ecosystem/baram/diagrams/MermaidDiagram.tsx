import DOMPurify from "dompurify";

interface MermaidDiagramProps {
  svg: string;
  alt: string;
  className?: string;
}

export function MermaidDiagram({ svg, alt, className }: MermaidDiagramProps) {
  const sanitizedSvg = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
  });

  return (
    <div
      className={`overflow-auto bg-nasun-white rounded-lg border border-nasun-black/10 p-4 [&>svg]:w-full [&>svg]:h-auto ${className ?? ""}`}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  );
}
