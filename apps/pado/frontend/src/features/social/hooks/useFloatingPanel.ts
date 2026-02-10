/**
 * useFloatingPanel - Drag + resize logic for floating panels.
 * Persists position/size in localStorage, clamps to viewport.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface PanelState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_W = 280;
const MIN_H = 300;
const MAX_W = 600;
const MAX_H = 800;

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function loadState(key: string, defaults: PanelState): PanelState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return defaults;
}

function saveState(key: string, state: PanelState) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* noop */ }
}

function clampToViewport(s: PanelState): PanelState {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    width: clamp(s.width, MIN_W, Math.min(MAX_W, vw - 16)),
    height: clamp(s.height, MIN_H, Math.min(MAX_H, vh - 16)),
    x: clamp(s.x, 0, Math.max(0, vw - s.width)),
    y: clamp(s.y, 0, Math.max(0, vh - s.height)),
  };
}

export function useFloatingPanel(storageKey: string, defaults: PanelState) {
  const [state, setState] = useState<PanelState>(() =>
    clampToViewport(loadState(storageKey, defaults))
  );
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  // Persist on change
  useEffect(() => { saveState(storageKey, state); }, [storageKey, state]);

  // Clamp on window resize
  useEffect(() => {
    const onResize = () => setState(prev => clampToViewport(prev));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Drag handler — attach to header element
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    const offsetX = e.clientX - s.x;
    const offsetY = e.clientY - s.y;

    const onMove = (ev: MouseEvent) => {
      setState(prev => ({
        ...prev,
        x: clamp(ev.clientX - offsetX, 0, window.innerWidth - prev.width),
        y: clamp(ev.clientY - offsetY, 0, window.innerHeight - prev.height),
      }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Resize handler — attach to resize handle element
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const s = stateRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = s.width;
    const startH = s.height;

    const onMove = (ev: MouseEvent) => {
      const newW = clamp(startW + (ev.clientX - startX), MIN_W, MAX_W);
      const newH = clamp(startH + (ev.clientY - startY), MIN_H, MAX_H);
      setState(prev => ({
        ...prev,
        width: newW,
        height: newH,
      }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return { position: state, onDragStart, onResizeStart };
}
