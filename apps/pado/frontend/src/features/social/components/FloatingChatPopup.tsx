/**
 * FloatingChatPopup - Draggable + resizable floating chat window.
 * Contains ChatPanel inside a movable container with drag header and resize handle.
 * ChatPanel header is visible; drag bar only provides dock/close controls.
 * Supports 8-directional resize (4 edges + 4 corners).
 */

import { ChatPanel } from './ChatPanel';
import { useFloatingPanel, type ResizeDirection } from '../hooks/useFloatingPanel';

interface Props {
  onDock?: () => void;
  onClose?: () => void;
}

const DEFAULTS = { x: 0, y: 0, width: 340, height: 480 };
const EDGE = 4; // resize handle thickness (px)

const CURSOR_MAP: Record<ResizeDirection, string> = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
};

const HANDLE_STYLES: Record<ResizeDirection, React.CSSProperties> = {
  n:  { top: 0, left: EDGE, right: EDGE, height: EDGE },
  s:  { bottom: 0, left: EDGE, right: EDGE, height: EDGE },
  e:  { top: EDGE, right: 0, bottom: EDGE, width: EDGE },
  w:  { top: EDGE, left: 0, bottom: EDGE, width: EDGE },
  nw: { top: 0, left: 0, width: EDGE * 2, height: EDGE * 2 },
  ne: { top: 0, right: 0, width: EDGE * 2, height: EDGE * 2 },
  sw: { bottom: 0, left: 0, width: EDGE * 2, height: EDGE * 2 },
  se: { bottom: 0, right: 0, width: EDGE * 2, height: EDGE * 2 },
};

const DIRECTIONS: ResizeDirection[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

function getInitialPosition() {
  return {
    ...DEFAULTS,
    x: window.innerWidth - DEFAULTS.width - 24,
    y: window.innerHeight - DEFAULTS.height - 24,
  };
}

export function FloatingChatPopup({ onDock, onClose }: Props) {
  const { position, onDragStart, onEdgeResizeStart } = useFloatingPanel(
    'pado_chat_float_pos',
    getInitialPosition()
  );

  return (
    <div
      className="fixed z-50 shadow-2xl rounded-lg border border-theme-border overflow-hidden flex flex-col bg-theme-bg-secondary"
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
      }}
    >
      {/* 8-directional resize handles */}
      {DIRECTIONS.map((dir) => (
        <div
          key={dir}
          className={`absolute z-10 ${CURSOR_MAP[dir]}`}
          style={HANDLE_STYLES[dir]}
          onMouseDown={(e) => onEdgeResizeStart(dir, e)}
        />
      ))}

      {/* Draggable header with dock/close controls */}
      <div
        className="shrink-0 h-7 bg-theme-bg-tertiary flex items-center justify-end px-2.5 cursor-move select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {onDock && (
            <button
              onClick={onDock}
              className="p-0.5 text-theme-text-muted hover:text-theme-text-primary transition-colors"
              title="Dock chat back"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 text-theme-text-muted hover:text-theme-text-primary transition-colors"
              title="Close chat"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Chat content */}
      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>
    </div>
  );
}
