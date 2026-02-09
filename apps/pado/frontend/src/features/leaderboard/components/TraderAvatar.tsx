import { memo } from 'react';

/**
 * TraderAvatar -- deterministic SVG avatar generated from wallet address hash.
 * Zero external dependencies. Produces a unique 4x4 grid pattern per address.
 */

const PALETTE = [
  '#F97316', '#3B82F6', '#A855F7', '#6366F1',
  '#14B8A6', '#EF4444', '#22C55E', '#FACC15',
];

function hashAddress(address: string): number[] {
  const bytes: number[] = [];
  const hex = address.replace('0x', '').slice(0, 32);
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16) || 0);
  }
  return bytes;
}

interface TraderAvatarProps {
  address: string;
  size?: number;
}

export const TraderAvatar = memo(function TraderAvatar({ address, size = 40 }: TraderAvatarProps) {
  const bytes = hashAddress(address);
  const bg = PALETTE[bytes[0] % PALETTE.length];
  const fg = PALETTE[(bytes[1] + 3) % PALETTE.length];
  const cellSize = size / 4;

  // Generate 4x4 grid (mirrored horizontally for symmetry)
  const cells: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const byteIdx = (row * 2 + col + 2) % bytes.length;
      if (bytes[byteIdx] % 2 === 0) {
        cells.push({ x: col, y: row });
        cells.push({ x: 3 - col, y: row }); // mirror
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-lg shrink-0"
    >
      <rect width={size} height={size} fill={bg} rx={size * 0.15} />
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x * cellSize}
          y={cell.y * cellSize}
          width={cellSize}
          height={cellSize}
          fill={fg}
          opacity={0.85}
        />
      ))}
    </svg>
  );
});
