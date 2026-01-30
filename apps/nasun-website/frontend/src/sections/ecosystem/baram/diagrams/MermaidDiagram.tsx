interface MermaidDiagramProps {
  svg: string;
  alt: string;
}

export function MermaidDiagram({ svg, alt }: MermaidDiagramProps) {
  return (
    <div
      className="overflow-x-auto bg-nasun-white rounded-lg border border-nasun-black/10 p-4 flex justify-center"
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
