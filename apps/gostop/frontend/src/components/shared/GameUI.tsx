/**
 * Shared UI components for all games.
 */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A reusable bet input slider with log scale support (useful for wide ranges).
 */
export function BetSlider({
  value,
  min,
  max,
  onChange,
  accentColor = "rgb(234 179 8)", // gold-500
}: {
  value: string;
  min: number;
  max: number;
  onChange: (v: string) => void;
  accentColor?: string;
}) {
  const toSlider = (v: number) => Math.round(((Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000);
  const fromSlider = (s: number) => Math.exp(Math.log(min) + (s / 1000) * (Math.log(max) - Math.log(min)));
  
  const num = Math.max(min, Math.min(max, parseFloat(value) || min));
  const sliderVal = toSlider(num);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = fromSlider(Number(e.target.value));
    // Snapping logic for cleaner values
    const snapped = raw < 10 ? Math.round(raw) : raw < 100 ? Math.round(raw / 5) * 5 : Math.round(raw / 10) * 10;
    onChange(String(Math.max(min, Math.min(max, snapped))));
  };

  return (
    <div className="px-1">
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={sliderVal}
        onChange={handleSliderChange}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${sliderVal / 10}%, rgb(55 65 81) ${sliderVal / 10}%, rgb(55 65 81) 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-gray-500 mt-1.5 font-mono">
        <span>{min} NUSDC</span>
        <span>{max} NUSDC</span>
      </div>
    </div>
  );
}

/**
 * Standard game header with image and description.
 */
export function GameHeader({
  thumb,
  category,
  title,
  description,
  children,
}: {
  thumb: string;
  category: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)] flex flex-col md:flex-row md:items-center gap-6">
      <img
        src={thumb}
        alt=""
        aria-hidden
        className="w-full md:w-48 h-40 md:h-48 rounded-xl object-cover border border-gold-subtle shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">{category}</p>
        <h1 className="font-display text-4xl md:text-5xl text-gold">{title}</h1>
        <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">{description}</p>
        {children}
      </div>
    </header>
  );
}
