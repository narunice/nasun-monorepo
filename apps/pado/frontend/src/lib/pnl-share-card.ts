/**
 * PnL Share Card Generator
 * Creates a canvas-based image card for sharing trade results on social media.
 * No external dependencies - pure Canvas API.
 */

export interface PnlCardData {
  side: 'BUY' | 'SELL';
  pair: string;           // e.g. "NBTC/NUSDC"
  pnl: number;            // Dollar PnL
  pnlPercent: number;     // Percentage return
  entryPrice: number;
  exitPrice?: number;     // For sells (realized)
  currentPrice?: number;  // For buys (unrealized)
  quantity: number;
  baseSymbol: string;
  fee?: number;
  timestamp: number;
}

const CARD_WIDTH = 600;
const CARD_HEIGHT = 340;

// Colors
const BG_COLOR = '#0f1117';
const BG_ACCENT = '#161922';
const GREEN = '#22c55e';
const RED = '#ef4444';
const TEXT_PRIMARY = '#f1f5f9';
const TEXT_SECONDARY = '#94a3b8';
const TEXT_MUTED = '#64748b';
const BRAND_BLUE = '#3b82f6';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toFixed(4)}`;
}

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${pnl.toFixed(2)}`;
}

function formatPercent(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Generate a PnL share card as a canvas-rendered Blob (PNG).
 */
export async function generatePnlCard(data: PnlCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Background with rounded corners
  ctx.fillStyle = BG_COLOR;
  roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 16);
  ctx.fill();

  // Subtle inner border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, 16);
  ctx.stroke();

  // Header section
  // Pado logo text
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = 'bold 22px "Rubik", system-ui, sans-serif';
  ctx.fillText('PADO', 28, 42);

  // DEX badge
  ctx.fillStyle = BRAND_BLUE;
  ctx.font = '11px "Rubik", system-ui, sans-serif';
  const dexText = 'Decentralized Exchange';
  ctx.fillText(dexText, 88, 42);

  // Side + Pair
  const isProfit = data.pnl >= 0;
  const sideColor = data.side === 'BUY' ? GREEN : RED;
  ctx.fillStyle = sideColor;
  ctx.font = 'bold 14px "Rubik", system-ui, sans-serif';
  ctx.fillText(data.side, 28, 72);

  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = '14px "Rubik", system-ui, sans-serif';
  ctx.fillText(data.pair, 28 + ctx.measureText(data.side + '  ').width, 72);

  // Unrealized/Realized badge
  const isRealized = data.side === 'SELL' && data.exitPrice != null;
  const badgeText = isRealized ? 'Realized' : 'Unrealized';
  const badgeColor = isRealized ? GREEN : '#eab308';
  ctx.fillStyle = badgeColor;
  ctx.font = '11px "Rubik", system-ui, sans-serif';
  const badgeX = CARD_WIDTH - 28 - ctx.measureText(badgeText).width;
  ctx.fillText(badgeText, badgeX, 72);

  // PnL section (big text)
  const pnlColor = isProfit ? GREEN : RED;

  // PnL dollar amount
  ctx.fillStyle = pnlColor;
  ctx.font = 'bold 42px "Rubik", system-ui, sans-serif';
  const pnlText = formatPnl(data.pnl);
  ctx.fillText(pnlText, 28, 130);

  // PnL percentage
  ctx.font = 'bold 20px "Rubik", system-ui, sans-serif';
  const pctText = formatPercent(data.pnlPercent);
  const pnlWidth = ctx.measureText(pnlText).width;
  ctx.font = 'bold 42px "Rubik", system-ui, sans-serif';
  const actualPnlWidth = ctx.measureText(pnlText).width;
  ctx.font = 'bold 20px "Rubik", system-ui, sans-serif';
  ctx.fillText(pctText, 28 + actualPnlWidth + 12, 130);

  // Details section background
  ctx.fillStyle = BG_ACCENT;
  roundRect(ctx, 20, 152, CARD_WIDTH - 40, 120, 10);
  ctx.fill();

  // Detail rows
  const detailY = 178;
  const lineHeight = 26;
  const labelX = 36;
  const valueX = CARD_WIDTH / 2 - 20;
  const label2X = CARD_WIDTH / 2 + 20;
  const value2X = CARD_WIDTH - 36;

  ctx.font = '12px "Rubik", system-ui, sans-serif';

  // Row 1: Entry Price | Size
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('Entry Price', labelX, detailY);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.textAlign = 'right';
  ctx.fillText(formatPrice(data.entryPrice), valueX, detailY);

  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('Size', label2X, detailY);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.textAlign = 'right';
  ctx.fillText(`${data.quantity.toFixed(5)} ${data.baseSymbol}`, value2X, detailY);

  // Row 2: Exit/Current Price | Fee
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT_MUTED;
  const priceLabel = isRealized ? 'Exit Price' : 'Mark Price';
  ctx.fillText(priceLabel, labelX, detailY + lineHeight);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.textAlign = 'right';
  const displayPrice = isRealized ? data.exitPrice! : (data.currentPrice ?? data.entryPrice);
  ctx.fillText(formatPrice(displayPrice), valueX, detailY + lineHeight);

  if (data.fee != null) {
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText('Fee', label2X, detailY + lineHeight);
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.textAlign = 'right';
    ctx.fillText(`$${data.fee.toFixed(2)}`, value2X, detailY + lineHeight);
  }

  // Row 3: Total Value | Timestamp
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('Total Value', labelX, detailY + lineHeight * 2);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.textAlign = 'right';
  const total = data.entryPrice * data.quantity;
  ctx.fillText(`$${total.toFixed(2)}`, valueX, detailY + lineHeight * 2);

  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('Time', label2X, detailY + lineHeight * 2);
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.textAlign = 'right';
  const dateStr = new Date(data.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  ctx.fillText(dateStr, value2X, detailY + lineHeight * 2);

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '11px "Rubik", system-ui, sans-serif';
  ctx.fillText('pado.finance', 28, CARD_HEIGHT - 18);

  // Nasun chain badge
  ctx.fillStyle = '#475569';
  ctx.font = '10px "Rubik", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Powered by Nasun Network', CARD_WIDTH - 28, CARD_HEIGHT - 18);

  // Reset text align
  ctx.textAlign = 'left';

  // Convert to blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to generate card image'));
      },
      'image/png',
    );
  });
}

/**
 * Download the PnL card as a PNG file.
 */
export async function downloadPnlCard(data: PnlCardData): Promise<void> {
  const blob = await generatePnlCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pado-pnl-${data.pair.replace('/', '-')}-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy the PnL card image to clipboard (if supported).
 * Falls back to download if clipboard write is not available.
 */
export async function copyPnlCardToClipboard(data: PnlCardData): Promise<boolean> {
  const blob = await generatePnlCard(data);

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      return true;
    } catch {
      // Clipboard write failed, fall through to download
    }
  }

  // Fallback: download
  await downloadPnlCard(data);
  return false;
}
