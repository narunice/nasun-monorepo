interface MermaidDiagramProps {
  svg: string;
  alt: string;
  className?: string;
}

export function MermaidDiagram({ svg, alt, className }: MermaidDiagramProps) {
  return (
    <div
      className={`overflow-auto bg-nasun-white rounded-lg border border-nasun-black/10 p-4 [&>svg]:w-full [&>svg]:h-auto ${className ?? ""}`}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
