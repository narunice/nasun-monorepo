/**
 * FloatingChatPopup - Draggable + resizable floating chat window.
 * Contains ChatPanel inside a movable container with drag header and resize handle.
 */

import { ChatPanel } from './ChatPanel';
import { useFloatingPanel } from '../hooks/useFloatingPanel';

interface Props {
  onDock: () => void;
}

const DEFAULTS = { x: 0, y: 0, width: 340, height: 480 };

function getInitialPosition() {
  return {
    ...DEFAULTS,
    x: window.innerWidth - DEFAULTS.width - 24,
    y: window.innerHeight - DEFAULTS.height - 24,
  };
}

export function FloatingChatPopup({ onDock }: Props) {
  const { position, onDragStart, onResizeStart } = useFloatingPanel(
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
      {/* Draggable header */}
      <div
        className="shrink-0 h-7 bg-theme-bg-tertiary flex items-center justify-between px-2.5 cursor-move select-none border-b border-theme-border"
        onMouseDown={onDragStart}
      >
        <span className="text-[11px] font-medium text-theme-text-secondary">Chat</span>
        <div className="flex items-center gap-1">
          {/* Dock back button */}
          <button
            onClick={onDock}
            className="p-0.5 text-theme-text-muted hover:text-theme-text-primary transition-colors"
            title="Dock chat back"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chat content */}
      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>

      {/* Resize handle (bottom-right) */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5"
        onMouseDown={onResizeStart}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-theme-text-muted opacity-40 hover:opacity-80">
          <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
