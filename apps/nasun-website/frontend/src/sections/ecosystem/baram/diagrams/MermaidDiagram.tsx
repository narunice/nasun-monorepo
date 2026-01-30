interface MermaidDiagramProps {
  svg: string;
  alt: string;
  maxHeight?: string;
}

export function MermaidDiagram({ svg, alt, maxHeight }: MermaidDiagramProps) {
  return (
    <div
      className={`overflow-auto bg-nasun-white rounded-lg border border-nasun-black/10 p-4 [&>svg]:max-w-full [&>svg]:h-auto ${maxHeight ?? ""}`}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
