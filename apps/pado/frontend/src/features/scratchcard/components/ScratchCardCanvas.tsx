import { useRef, useEffect, useState, useCallback } from 'react';

interface ScratchCardCanvasProps {
  width: number;
  height: number;
  /** Called when >= 50% of the surface has been scratched */
  onReveal: () => void;
  /** If true, immediately clear the canvas */
  revealed: boolean;
  children: React.ReactNode;
}

const BRUSH_RADIUS = typeof window !== 'undefined' && 'ontouchstart' in window ? 20 : 15;
const REVEAL_THRESHOLD = 0.5;

export function ScratchCardCanvas({
  width,
  height,
  onReveal,
  revealed,
  children,
}: ScratchCardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);
  const revealedRef = useRef(false);

  // Draw the scratch surface
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale for device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Gradient surface (teal pado brand)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a8cbc');
    gradient.addColorStop(1, '#3bb9d8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // "SCRATCH" text pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.font = 'bold 14px Rubik, sans-serif';
    ctx.textAlign = 'center';
    for (let y = 30; y < height; y += 40) {
      for (let x = 40; x < width; x += 100) {
        ctx.fillText('SCRATCH', x, y);
      }
    }

    revealedRef.current = false;
  }, [width, height]);

  // Handle instant reveal
  useEffect(() => {
    if (!revealed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fade out animation
    canvas.style.transition = 'opacity 0.4s ease-out';
    canvas.style.opacity = '0';
  }, [revealed]);

  const getPosition = useCallback(
    (e: React.TouchEvent | React.MouseEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();

      if ('touches' in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const scratch = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;
      if (!canvas || revealedRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.scale(1 / dpr, 1 / dpr);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x * dpr, y * dpr, BRUSH_RADIUS * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [],
  );

  const checkRevealProgress = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let transparent = 0;
    // Check alpha channel (every 4th byte), sample every 4th pixel for performance
    for (let i = 3; i < pixels.length; i += 16) {
      if (pixels[i] === 0) transparent++;
    }
    const total = Math.floor(pixels.length / 16);
    const ratio = transparent / total;

    if (ratio >= REVEAL_THRESHOLD) {
      revealedRef.current = true;
      onReveal();
    }
  }, [onReveal]);

  const handleStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      setHasStarted(true);
      const pos = getPosition(e);
      if (pos) scratch(pos.x, pos.y);
    },
    [getPosition, scratch],
  );

  const handleMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const pos = getPosition(e);
      if (pos) scratch(pos.x, pos.y);
    },
    [getPosition, scratch],
  );

  const handleEnd = useCallback(() => {
    isDrawingRef.current = false;
    checkRevealProgress();
  }, [checkRevealProgress]);

  return (
    <div
      className="relative select-none rounded-lg overflow-hidden"
      style={{ width, height }}
    >
      {/* Result layer (underneath) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>

      {/* Canvas scratch layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-pointer touch-none"
        style={{ width, height }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />

      {/* Hint text overlay (before scratching starts) */}
      {!hasStarted && !revealed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-white/70 text-lg font-medium">
            Scratch here!
          </p>
        </div>
      )}
    </div>
  );
}
