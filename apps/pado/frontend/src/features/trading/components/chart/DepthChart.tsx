/**
 * DepthChart - Cumulative bid/ask depth visualization
 *
 * Canvas-based depth chart showing cumulative order volume vs price.
 * Bid curve (green, left) and Ask curve (red, right) with mid price marker.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { PriceLevel } from '../../../../lib/deepbook';
import { useTheme } from '../../../../providers/theme';

interface DepthChartProps {
  bids: PriceLevel[];
  asks: PriceLevel[];
  midPrice: number;
  className?: string;
}

const COLORS = {
  light: {
    bidFill: 'rgba(34, 197, 94, 0.15)',
    bidLine: '#22c55e',
    askFill: 'rgba(239, 68, 68, 0.15)',
    askLine: '#ef4444',
    midLine: '#94a3b8',
    gridLine: '#e2e8f0',
    text: '#64748b',
    bg: '#ffffff',
  },
  dark: {
    bidFill: 'rgba(34, 197, 94, 0.12)',
    bidLine: '#22c55e',
    askFill: 'rgba(239, 68, 68, 0.12)',
    askLine: '#ef4444',
    midLine: '#475569',
    gridLine: '#1e293b',
    text: '#94a3b8',
    bg: '#0f172a',
  },
};

const PADDING = { top: 20, right: 10, bottom: 30, left: 50 };

export function DepthChart({ bids, asks, midPrice, className = '' }: DepthChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const colors = COLORS[theme];

  // Build cumulative data (cap levels to prevent performance issues with large datasets)
  const MAX_DEPTH_LEVELS = 200;
  const { bidData, askData, maxQty, minPrice, maxPrice } = useMemo(() => {
    // Bids: sorted best (highest) first → cumulate downward
    const sortedBids = [...bids].sort((a, b) => b.price - a.price).slice(0, MAX_DEPTH_LEVELS);
    const bidData = sortedBids.reduce<Array<{ price: number; cumQty: number }>>((acc, l) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumQty : 0;
      acc.push({ price: l.price, cumQty: prev + l.quantity });
      return acc;
    }, []);

    // Asks: sorted best (lowest) first → cumulate upward
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price).slice(0, MAX_DEPTH_LEVELS);
    const askData = sortedAsks.reduce<Array<{ price: number; cumQty: number }>>((acc, l) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumQty : 0;
      acc.push({ price: l.price, cumQty: prev + l.quantity });
      return acc;
    }, []);

    const maxBidQty = bidData.length > 0 ? bidData[bidData.length - 1].cumQty : 0;
    const maxAskQty = askData.length > 0 ? askData[askData.length - 1].cumQty : 0;
    const maxQty = Math.max(maxBidQty, maxAskQty) || 1;

    // Safe min/max without spread to avoid call stack overflow on large arrays
    let minP = Infinity;
    let maxP = -Infinity;
    for (const d of bidData) {
      if (d.price < minP) minP = d.price;
      if (d.price > maxP) maxP = d.price;
    }
    for (const d of askData) {
      if (d.price < minP) minP = d.price;
      if (d.price > maxP) maxP = d.price;
    }
    if (!isFinite(minP)) minP = midPrice * 0.95;
    if (!isFinite(maxP)) maxP = midPrice * 1.05;

    return { bidData, askData, maxQty, minPrice: minP, maxPrice: maxP };
  }, [bids, asks, midPrice]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    const chartW = w - PADDING.left - PADDING.right;
    const chartH = h - PADDING.top - PADDING.bottom;

    if (chartW <= 0 || chartH <= 0 || (bidData.length === 0 && askData.length === 0)) {
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.font = '12px monospace';
      ctx.fillText('No orderbook data', w / 2, h / 2);
      return;
    }

    const priceRange = maxPrice - minPrice || 1;
    const toX = (price: number) => PADDING.left + ((price - minPrice) / priceRange) * chartW;
    const toY = (qty: number) => PADDING.top + chartH - (qty / maxQty) * chartH;

    // Grid lines (3 horizontal)
    ctx.strokeStyle = colors.gridLine;
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = PADDING.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(w - PADDING.right, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'right';
    ctx.font = '10px monospace';
    for (let i = 0; i <= 4; i++) {
      const qty = (maxQty * (4 - i)) / 4;
      const y = PADDING.top + (chartH * i) / 4;
      ctx.fillText(qty.toFixed(qty >= 10 ? 1 : 2), PADDING.left - 5, y + 4);
    }

    // X-axis labels (5 evenly spaced prices)
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const p = minPrice + (priceRange * i) / 4;
      const x = toX(p);
      ctx.fillText(p.toFixed(p >= 100 ? 0 : 2), x, h - 8);
    }

    // Draw bid area (step-wise, right to left)
    if (bidData.length > 0) {
      ctx.beginPath();
      // Start at midPrice bottom
      ctx.moveTo(toX(bidData[0].price), toY(0));
      ctx.lineTo(toX(bidData[0].price), toY(bidData[0].cumQty));
      for (let i = 1; i < bidData.length; i++) {
        // Horizontal step, then vertical
        ctx.lineTo(toX(bidData[i].price), toY(bidData[i - 1].cumQty));
        ctx.lineTo(toX(bidData[i].price), toY(bidData[i].cumQty));
      }
      // Close to bottom
      ctx.lineTo(toX(bidData[bidData.length - 1].price), toY(0));
      ctx.closePath();
      ctx.fillStyle = colors.bidFill;
      ctx.fill();

      // Bid line
      ctx.beginPath();
      ctx.moveTo(toX(bidData[0].price), toY(bidData[0].cumQty));
      for (let i = 1; i < bidData.length; i++) {
        ctx.lineTo(toX(bidData[i].price), toY(bidData[i - 1].cumQty));
        ctx.lineTo(toX(bidData[i].price), toY(bidData[i].cumQty));
      }
      ctx.strokeStyle = colors.bidLine;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw ask area (step-wise, left to right)
    if (askData.length > 0) {
      ctx.beginPath();
      ctx.moveTo(toX(askData[0].price), toY(0));
      ctx.lineTo(toX(askData[0].price), toY(askData[0].cumQty));
      for (let i = 1; i < askData.length; i++) {
        ctx.lineTo(toX(askData[i].price), toY(askData[i - 1].cumQty));
        ctx.lineTo(toX(askData[i].price), toY(askData[i].cumQty));
      }
      ctx.lineTo(toX(askData[askData.length - 1].price), toY(0));
      ctx.closePath();
      ctx.fillStyle = colors.askFill;
      ctx.fill();

      // Ask line
      ctx.beginPath();
      ctx.moveTo(toX(askData[0].price), toY(askData[0].cumQty));
      for (let i = 1; i < askData.length; i++) {
        ctx.lineTo(toX(askData[i].price), toY(askData[i - 1].cumQty));
        ctx.lineTo(toX(askData[i].price), toY(askData[i].cumQty));
      }
      ctx.strokeStyle = colors.askLine;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Mid price dashed line
    if (midPrice > minPrice && midPrice < maxPrice) {
      const midX = toX(midPrice);
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.moveTo(midX, PADDING.top);
      ctx.lineTo(midX, h - PADDING.bottom);
      ctx.strokeStyle = colors.midLine;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // Mid price label
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillText(`Mid: $${midPrice.toFixed(2)}`, midX, PADDING.top - 5);
    }
  }, [bidData, askData, maxQty, minPrice, maxPrice, midPrice, colors]);

  // Draw on data/theme change
  useEffect(() => { draw(); }, [draw]);

  // Stable ref for ResizeObserver to avoid disconnect/reconnect churn on data updates
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; });

  // ResizeObserver for responsive sizing (runs once, reads draw via ref)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        role="img"
        aria-label={`Depth chart: ${bids.length} bid levels, ${asks.length} ask levels, mid price $${midPrice.toFixed(2)}`}
      />
    </div>
  );
}
