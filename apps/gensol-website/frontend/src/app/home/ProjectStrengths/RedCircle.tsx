interface RedCircleProps {
  delay: number;
}

export function RedCircle({ delay }: RedCircleProps) {
  return (
    <div
      className="absolute inset-0 m-auto rounded-full border-[1px] border-sf-red animate-pulse-circle opacity-0"
      style={{
        animationDelay: `${delay}s`,
        width: '60vw',
        height: '60vw',
      }}
    />
  );
}
