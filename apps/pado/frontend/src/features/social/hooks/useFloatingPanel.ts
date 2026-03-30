/**
 * useFloatingPanel - Drag + resize logic for floating panels.
 * Persists position/size in localStorage, clamps to viewport.
 * Supports 8-directional resize (4 edges + 4 corners).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface PanelState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

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

  // Drag handler -- attach to header element
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

  // Directional resize handler
  const onEdgeResizeStart = useCallback((dir: ResizeDirection, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const s = stateRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = s.width;
    const startH = s.height;
    const startLeft = s.x;
    const startTop = s.y;

    const resizesLeft = dir.includes('w');
    const resizesRight = dir.includes('e');
    const resizesTop = dir.includes('n');
    const resizesBottom = dir.includes('s');

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let newW = startW;
      let newH = startH;
      let newX = startLeft;
      let newY = startTop;

      if (resizesRight) {
        newW = clamp(startW + dx, MIN_W, MAX_W);
      }
      if (resizesLeft) {
        const proposedW = clamp(startW - dx, MIN_W, MAX_W);
        newX = startLeft + (startW - proposedW);
        newW = proposedW;
      }
      if (resizesBottom) {
        newH = clamp(startH + dy, MIN_H, MAX_H);
      }
      if (resizesTop) {
        const proposedH = clamp(startH - dy, MIN_H, MAX_H);
        newY = startTop + (startH - proposedH);
        newH = proposedH;
      }

      // Clamp position to viewport
      newX = clamp(newX, 0, window.innerWidth - newW);
      newY = clamp(newY, 0, window.innerHeight - newH);

      setState({ x: newX, y: newY, width: newW, height: newH });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Legacy: bottom-right only (backward compat)
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    onEdgeResizeStart('se', e);
  }, [onEdgeResizeStart]);

  return { position: state, onDragStart, onResizeStart, onEdgeResizeStart };
}
