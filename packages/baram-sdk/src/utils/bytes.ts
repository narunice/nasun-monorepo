/**
 * Byte/hex conversion utilities
 */

export function bytesToHex(bytes: number[] | string): string {
  if (typeof bytes === 'string') return bytes;
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}
