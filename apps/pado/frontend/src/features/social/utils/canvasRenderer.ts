/**
 * Canvas-based share card renderer for PnL, trade, and portfolio cards.
 * Produces branded PNG images for sharing on social media / chat.
 */

// ===== Types =====

export interface TradeCardData {
  pair: string;          // e.g., "NBTC/NUSDC"
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  total: number;
  pnl?: number;
  pnlPct?: number;
  txDigest?: string;
  nickname?: string;
  timestamp: number;
}

export interface PnlCardData {
  nickname?: string;
  totalPnl: number;
  totalPnlPct: number;
  period: string;        // e.g., "24H", "7D", "All Time"
  winRate: number;       // 0-100
  totalTrades: number;
  totalVolume: number;
  bestTrade: number;
  worstTrade: number;
  timestamp: number;
}

export interface PortfolioCardData {
  nickname?: string;
  totalValue: number;
  pnl24h: number;
  change24h: number;
  tokens: Array<{
    symbol: string;
    value: number;
    allocation: number;  // percentage
  }>;
  totalTrades: number;
  totalVolume: number;
  timestamp: number;
  maskBalances?: boolean;
}

// ===== Constants =====

const CARD_WIDTH = 600;
const CARD_HEIGHT = 400;
const PADDING = 32;
const CORNER_RADIUS = 16;

const COLORS = {
  bgDark: '#0b1120',
  bgCard: '#131c2b',
  bgAccent: '#1a2744',
  textPrimary: '#e1e5ea',
  textSecondary: '#7d9dbf',
  textMuted: '#4a6480',
  green: '#22c55e',
  greenBg: 'rgba(34, 197, 94, 0.12)',
  red: '#ef4444',
  redBg: 'rgba(239, 68, 68, 0.12)',
  blue: '#3b82f6',
  border: '#1f3a61',
} as const;

// ===== Helpers =====

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(2)}K`;
  return `$${abs.toFixed(2)}`;
}

function formatSignedUsd(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatUsd(value)}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, isProfit: boolean) {
  // Main background
  ctx.fillStyle = COLORS.bgDark;
  roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS);
  ctx.fill();

  // Subtle gradient overlay
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, isProfit ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.06)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS);
  ctx.fill();

  // Inner card
  ctx.fillStyle = COLORS.bgCard;
  roundRect(ctx, 12, 12, CARD_WIDTH - 24, CARD_HEIGHT - 24, 12);
  ctx.fill();
}

function drawHeader(ctx: CanvasRenderingContext2D, nickname: string | undefined, title: string) {
  const y = 40;

  // Pado logo "P" circle
  ctx.fillStyle = COLORS.blue;
  ctx.beginPath();
  ctx.arc(PADDING + 14, y + 2, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('P', PADDING + 14, y + 8);
  ctx.textAlign = 'left';

  // Title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(title, PADDING + 36, y + 6);

  // Nickname / User
  if (nickname) {
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(nickname, CARD_WIDTH - PADDING, y + 6);
    ctx.textAlign = 'left';
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, timestamp: number) {
  const y = CARD_HEIGHT - 30;

  // Date
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(formatDate(timestamp), PADDING, y);

  // Branding tagline
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Powered by Nasun L1', CARD_WIDTH / 2, y);
  ctx.textAlign = 'left';

  // Pado URL
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.blue;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('pado.finance', CARD_WIDTH - PADDING, y);
  ctx.textAlign = 'left';
}

function drawStatBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, value: string, valueColor?: string,
) {
  // Background
  ctx.fillStyle = COLORS.bgAccent;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  // Label
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(label, x + 10, y + 18);

  // Value
  ctx.fillStyle = valueColor || COLORS.textPrimary;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(value, x + 10, y + 38);
}

// ===== Card Renderers =====

export function renderTradeCard(data: TradeCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas 2D context');

  const hasPnl = data.pnl !== undefined;
  const isProfit = hasPnl ? (data.pnl ?? 0) >= 0 : data.side === 'BUY';

  drawBackground(ctx, isProfit);
  drawHeader(ctx, data.nickname, 'Trade Result');

  // Side badge
  const badgeY = 68;
  const sideColor = data.side === 'BUY' ? COLORS.green : COLORS.red;
  const sideBg = data.side === 'BUY' ? COLORS.greenBg : COLORS.redBg;

  ctx.fillStyle = sideBg;
  roundRect(ctx, PADDING, badgeY, 60, 28, 6);
  ctx.fill();
  ctx.fillStyle = sideColor;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(data.side, PADDING + 12, badgeY + 19);

  // Pair
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(data.pair, PADDING + 72, badgeY + 20);

  // PnL display (large)
  if (hasPnl) {
    const pnlY = 120;
    const pnlColor = (data.pnl ?? 0) >= 0 ? COLORS.green : COLORS.red;

    ctx.fillStyle = pnlColor;
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText(formatSignedUsd(data.pnl ?? 0), PADDING, pnlY);

    if (data.pnlPct !== undefined) {
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(formatPct(data.pnlPct), PADDING, pnlY + 28);
    }
  }

  // Trade details stats
  const statsY = hasPnl ? 175 : 120;
  const boxW = (CARD_WIDTH - PADDING * 2 - 16) / 3;

  drawStatBox(ctx, PADDING, statsY, boxW, 52,
    'Price', `$${data.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  drawStatBox(ctx, PADDING + boxW + 8, statsY, boxW, 52,
    'Quantity', data.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 }));
  drawStatBox(ctx, PADDING + (boxW + 8) * 2, statsY, boxW, 52,
    'Total', formatUsd(data.total));

  // TX digest if available
  if (data.txDigest) {
    const txY = statsY + 72;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`TX: ${data.txDigest}`, PADDING, txY);
  }

  // Divider
  const divY = CARD_HEIGHT - 52;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, divY);
  ctx.lineTo(CARD_WIDTH - PADDING, divY);
  ctx.stroke();

  drawFooter(ctx, data.timestamp);

  return canvas;
}

export function renderPnlCard(data: PnlCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas 2D context');

  const isProfit = data.totalPnl >= 0;

  drawBackground(ctx, isProfit);
  drawHeader(ctx, data.nickname, `P&L Summary — ${data.period}`);

  // Main PnL display
  const pnlY = 90;
  const pnlColor = isProfit ? COLORS.green : COLORS.red;

  ctx.fillStyle = pnlColor;
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.fillText(formatSignedUsd(data.totalPnl), PADDING, pnlY);

  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(formatPct(data.totalPnlPct), PADDING, pnlY + 30);

  // Stats grid (2 rows x 3 cols)
  const gridY = 145;
  const boxW = (CARD_WIDTH - PADDING * 2 - 16) / 3;
  const boxH = 52;
  const gap = 8;

  // Row 1
  drawStatBox(ctx, PADDING, gridY, boxW, boxH,
    'Win Rate', `${data.winRate.toFixed(1)}%`,
    data.winRate >= 50 ? COLORS.green : COLORS.red);
  drawStatBox(ctx, PADDING + boxW + gap, gridY, boxW, boxH,
    'Trades', `${data.totalTrades}`);
  drawStatBox(ctx, PADDING + (boxW + gap) * 2, gridY, boxW, boxH,
    'Volume', formatUsd(data.totalVolume));

  // Row 2
  const row2Y = gridY + boxH + gap;
  drawStatBox(ctx, PADDING, row2Y, boxW, boxH,
    'Best Trade', formatSignedUsd(data.bestTrade), COLORS.green);
  drawStatBox(ctx, PADDING + boxW + gap, row2Y, boxW, boxH,
    'Worst Trade', formatSignedUsd(data.worstTrade), COLORS.red);

  // Divider
  const divY = CARD_HEIGHT - 52;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, divY);
  ctx.lineTo(CARD_WIDTH - PADDING, divY);
  ctx.stroke();

  drawFooter(ctx, data.timestamp);

  return canvas;
}

export function renderPortfolioCard(data: PortfolioCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas 2D context');

  const isProfit = data.change24h >= 0;

  drawBackground(ctx, isProfit);
  drawHeader(ctx, data.nickname, 'Portfolio');

  // Total value
  const valueY = 86;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 36px system-ui, sans-serif';
  const valueText = data.maskBalances
    ? '$***,***.**'
    : `$${data.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ctx.fillText(valueText, PADDING, valueY);

  // 24h PnL
  const pnlColor = isProfit ? COLORS.green : COLORS.red;
  ctx.fillStyle = pnlColor;
  ctx.font = 'bold 16px system-ui, sans-serif';
  const pnlText = data.maskBalances
    ? 'Today ***'
    : `Today ${formatSignedUsd(data.pnl24h)} (${formatPct(data.change24h)})`;
  ctx.fillText(pnlText, PADDING, valueY + 24);

  // Token allocation bars
  const barY = 135;
  const barH = 8;
  const barWidth = CARD_WIDTH - PADDING * 2;

  // Sort tokens by allocation desc
  const sortedTokens = [...data.tokens]
    .filter(t => t.allocation > 0)
    .sort((a, b) => b.allocation - a.allocation)
    .slice(0, 5);

  // Draw allocation bar
  const tokenColors = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];

  // Background bar
  ctx.fillStyle = COLORS.bgAccent;
  roundRect(ctx, PADDING, barY, barWidth, barH, 4);
  ctx.fill();

  // Filled segments
  let barX = PADDING;
  sortedTokens.forEach((token, i) => {
    const segW = Math.max(2, (token.allocation / 100) * barWidth);
    ctx.fillStyle = tokenColors[i % tokenColors.length];
    if (i === 0) {
      roundRect(ctx, barX, barY, Math.min(segW, barWidth), barH, 4);
    } else {
      ctx.fillRect(barX, barY, segW, barH);
    }
    ctx.fill();
    barX += segW;
  });

  // Token legend
  const legendY = barY + 22;
  let legendX = PADDING;
  sortedTokens.forEach((token, i) => {
    const color = tokenColors[i % tokenColors.length];

    // Color dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(legendX + 5, legendY + 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Symbol + percentage
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = '11px system-ui, sans-serif';
    const label = `${token.symbol} ${token.allocation.toFixed(1)}%`;
    ctx.fillText(label, legendX + 14, legendY + 9);
    legendX += ctx.measureText(label).width + 28;
  });

  // Holdings detail (if not masked)
  if (!data.maskBalances && sortedTokens.length > 0) {
    const detailY = legendY + 28;
    sortedTokens.forEach((token, i) => {
      const rowY = detailY + i * 22;
      if (rowY > CARD_HEIGHT - 70) return; // Don't overflow

      // Symbol
      ctx.fillStyle = tokenColors[i % tokenColors.length];
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(token.symbol, PADDING, rowY);

      // Value
      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatUsd(token.value), CARD_WIDTH - PADDING, rowY);
      ctx.textAlign = 'left';
    });
  }

  // Stats row at bottom
  const statsY = CARD_HEIGHT - 80;
  const boxW = (CARD_WIDTH - PADDING * 2 - 8) / 2;
  drawStatBox(ctx, PADDING, statsY, boxW, 38,
    'Trades', `${data.totalTrades}`);
  drawStatBox(ctx, PADDING + boxW + 8, statsY, boxW, 38,
    'Volume', formatUsd(data.totalVolume));

  // Divider
  const divY = CARD_HEIGHT - 35;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, divY);
  ctx.lineTo(CARD_WIDTH - PADDING, divY);
  ctx.stroke();

  drawFooter(ctx, data.timestamp);

  return canvas;
}

// ===== Export Utilities =====

/** Convert canvas to Blob (PNG) */
export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/** Download canvas as PNG file */
export async function downloadShareCard(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Copy canvas image to clipboard (if supported) */
export async function copyShareCardToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return true;
  } catch (err) {
    console.warn('Clipboard write failed:', err);
    return false;
  }
}
