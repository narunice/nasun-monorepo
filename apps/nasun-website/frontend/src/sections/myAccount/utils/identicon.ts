/** Generate a deterministic GitHub-style identicon SVG for a wallet address. */
export function generateWalletIdenticon(address: string): string {
  const clean = address.replace('0x', '').toLowerCase().padEnd(62, '0');
  const hue = parseInt(clean.slice(0, 6), 16) % 360;
  const sat = 50 + (parseInt(clean.slice(6, 8), 16) % 30);
  const light = 40 + (parseInt(clean.slice(8, 10), 16) % 20);
  const fgColor = `hsl(${hue},${sat}%,${light}%)`;
  const bgColor = `hsl(${hue},15%,12%)`;

  // 3 unique columns mirrored to 5 columns (symmetric identicon)
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(parseInt(clean.slice(10 + i * 2, 12 + i * 2), 16) % 2 === 0);
  }

  const CELL = 10;
  let rects = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 3 + (col <= 2 ? col : 4 - col);
      if (cells[idx]) {
        rects += `<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" fill="${fgColor}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="64" height="64"><rect width="50" height="50" fill="${bgColor}"/>${rects}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
