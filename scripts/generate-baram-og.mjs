/**
 * Generate Baram OG image (1200x630 PNG)
 *
 * Style: Light sky-blue gradient background, "Baram" in teal-gradient bold text,
 * "AI Compliance Settlement Layer" subtitle in gray.
 *
 * Usage: node scripts/generate-baram-og.mjs
 * Output: apps/baram/frontend/public/baram-og.png
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../apps/baram/frontend/public/baram-og.png');

const WIDTH = 1200;
const HEIGHT = 630;

// SVG with gradient background and text — matches the reference image style
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <!-- Background: subtle vertical gradient, light sky-blue -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8f4f8" />
      <stop offset="100%" stop-color="#d0e4ee" />
    </linearGradient>
    <!-- Title: teal gradient for "Baram" text -->
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4a9bb5" />
      <stop offset="100%" stop-color="#5a9e7d" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />

  <!-- "Baram" title -->
  <text
    x="${WIDTH / 2}" y="${HEIGHT / 2 - 20}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-weight="700"
    font-size="96"
    fill="url(#titleGrad)"
  >Baram</text>

  <!-- Subtitle -->
  <text
    x="${WIDTH / 2}" y="${HEIGHT / 2 + 60}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-weight="400"
    font-size="28"
    fill="#6b7b8d"
  >AI Compliance Settlement Layer</text>
</svg>`;

const buf = await sharp(Buffer.from(svg)).png().toFile(OUTPUT_PATH);
console.log(`Generated: ${OUTPUT_PATH} (${buf.width}x${buf.height}, ${buf.size} bytes)`);
