import { useMemo, useEffect, useState } from "react";
import { motion } from "framer-motion";

// Nasun brand confetti palette. No nasun-scarlet (reads as "error").
const COLORS = [
  "#94e1d3", // nasun-c3
  "#5ee1e4", // pado-3
  "#3bb9d8", // pado-2
  "#86f3b7", // pado-4
  "#f9a824", // nasun-c1
  "#FF4D4D", // nasun-coral
  "#7C5CFF", // pado-violet
  "#C9A7FF", // pado-lavender
];

const PARTICLE_COUNT = 36;
const BURST_DURATION_S = 1.6;

// Top-10 celebration burst. Particles spray from the center outward with a
// touch of downward gravity so they read as confetti rather than fireworks.
//
// Mount-and-forget: animates once, then renders nothing. The parent re-mounts
// this component whenever the slide changes (AnimatePresence keys on
// entry.id), so each new top-10 slide re-triggers the burst.
export function ConfettiBurst() {
  // Hide after the animation finishes so we don't keep DOM nodes around.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), (BURST_DURATION_S + 0.3) * 1000);
    return () => clearTimeout(t);
  }, []);

  // Pre-compute particle properties once so re-renders don't re-randomize.
  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * 130;
      return {
        angle,
        distance,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 720 - 360,
        delay: Math.random() * 0.12,
        // Asymmetric particles read as paper bits, not dots.
        width: 4 + Math.random() * 4,
        height: 6 + Math.random() * 6,
      };
    });
  }, []);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-20"
      aria-hidden
    >
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-1/2 left-1/2"
          style={{
            width: p.width,
            height: p.height,
            background: p.color,
            borderRadius: 1,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            // Slight downward bias to suggest gravity without fully simulating it.
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance + 50,
            rotate: p.rotation,
            opacity: 0,
          }}
          transition={{
            duration: BURST_DURATION_S,
            delay: p.delay,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      ))}
    </div>
  );
}
