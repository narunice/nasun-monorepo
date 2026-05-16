import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "../hooks/useChat";
import { useChatStore, MIN_SIZE, MAX_SIZE } from "../../../store/chatStore";
import { useUserStore } from "../../../store/userStore";
import type { RoomInfo } from "../../../lib/chat-service";
import MessageList from "./MessageList";
import MessageInput, { type MessageInputHandle } from "./MessageInput";

const VISIBLE_ROOM_IDS = new Set([0, 10, 20]);

function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-green-400"
      : status === "connecting"
        ? "bg-yellow-400"
        : "bg-red-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export default function ChatWidget() {
  const {
    messages,
    status,
    displayStatus,
    onlineCount,
    hasMore,
    sendMessage,
    loadMore,
    rooms,
    activeRoomId,
    switchRoom,
    toggleReaction,
    canChat,
  } = useChat();
  const visibleRooms = useMemo(
    () => rooms.filter((r) => VISIBLE_ROOM_IDS.has(r.id)),
    [rooms],
  );
  const isOpen = useChatStore((s) => s.isOpen);
  const toggleOpen = useChatStore((s) => s.toggleOpen);
  const position = useChatStore((s) => s.position);
  const size = useChatStore((s) => s.size);
  const setPosition = useChatStore((s) => s.setPosition);
  const setSize = useChatStore((s) => s.setSize);
  const mentionCount = useChatStore((s) => s.mentionCount);
  const mentionSoundEnabled = useChatStore((s) => s.mentionSoundEnabled);
  const clearMentions = useChatStore((s) => s.clearMentions);
  const toggleMentionSound = useChatStore((s) => s.toggleMentionSound);
  const authError = useChatStore((s) => s.authError);
  const setAuthError = useChatStore((s) => s.setAuthError);
  const currentUserId = useUserStore((s) => s.user?.walletAddress);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MessageInputHandle>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Mirror size into ref so drag/resize closures always read the latest value without stale captures
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  // Compute panel position (clamp to viewport on small screens)
  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
  const effectiveWidth = isMobile
    ? Math.min(size.width, window.innerWidth - 16)
    : size.width;
  const effectiveHeight = isMobile
    ? Math.min(size.height, window.innerHeight - 120)
    : size.height;
  const panelStyle = position
    ? {
        left: position.x,
        top: position.y,
        width: effectiveWidth,
        height: effectiveHeight,
      }
    : isMobile
      ? { left: 8, right: 8, bottom: 80, height: effectiveHeight }
      : {
          right: 24,
          bottom: 80,
          width: effectiveWidth,
          height: effectiveHeight,
        };

  // ===== Drag =====
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      isDragging.current = true;

      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const startLeft = rect.left;
      const startTop = rect.top;
      const panelW = rect.width;
      const panelH = rect.height;
      let finalX = startLeft;
      let finalY = startTop;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        finalX = Math.max(0, Math.min(window.innerWidth - panelW, ev.clientX - dragOffset.current.x));
        finalY = Math.max(0, Math.min(window.innerHeight - panelH, ev.clientY - dragOffset.current.y));
        // Use CSS transform to avoid triggering React re-renders during drag
        panel.style.transform = `translate(${finalX - startLeft}px, ${finalY - startTop}px)`;
      };
      const onMouseUp = () => {
        isDragging.current = false;
        panel.style.transform = '';
        // Commit final position to store only once on release
        setPosition({ x: finalX, y: finalY });
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [setPosition],
  );

  // ===== Resize (all edges and corners) =====
  type Edge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

  const onResizeStart = useCallback(
    (edge: Edge, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = rect.width;
      const startH = rect.height;
      const startLeft = rect.left;
      const startTop = rect.top;

      // Switch to explicit left/top positioning so imperative style writes are consistent
      panel.style.right = '';
      panel.style.bottom = '';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      panel.style.width = startW + 'px';
      panel.style.height = startH + 'px';

      let finalW = startW, finalH = startH;
      let finalX = startLeft, finalY = startTop;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newW = startW, newH = startH, newX = startLeft, newY = startTop;

        if (edge.includes("e")) newW = startW + dx;
        if (edge.includes("w")) { newW = startW - dx; newX = startLeft + dx; }
        if (edge.includes("s")) newH = startH + dy;
        if (edge.includes("n")) { newH = startH - dy; newY = startTop + dy; }

        const clampedW = Math.max(MIN_SIZE.width, Math.min(MAX_SIZE.width, newW));
        const clampedH = Math.max(MIN_SIZE.height, Math.min(MAX_SIZE.height, newH));

        if (edge.includes("w")) newX = startLeft + startW - clampedW;
        if (edge.includes("n")) newY = startTop + startH - clampedH;

        finalW = clampedW;
        finalH = clampedH;
        finalX = Math.max(0, newX);
        finalY = Math.max(0, newY);

        // Apply directly to DOM to avoid React re-renders during resize
        panel.style.width = finalW + 'px';
        panel.style.height = finalH + 'px';
        panel.style.left = finalX + 'px';
        panel.style.top = finalY + 'px';
      };
      const onMouseUp = () => {
        // Commit final size and position to store only once on release
        setSize({ width: finalW, height: finalH });
        setPosition({ x: finalX, y: finalY });
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [setSize, setPosition],
  );

  // Reset position on window resize to prevent off-screen
  useEffect(() => {
    const onResize = () => {
      const pos = useChatStore.getState().position;
      if (pos) {
        const s = useChatStore.getState().size;
        setPosition({
          x: Math.min(pos.x, window.innerWidth - s.width),
          y: Math.min(pos.y, window.innerHeight - s.height),
        });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setPosition]);

  // Clear mention badge when chat opens
  useEffect(() => {
    if (isOpen && mentionCount > 0) clearMentions();
  }, [isOpen, mentionCount, clearMentions]);

  return (
    <>
      {/* Login prompt panel */}
      {!canChat && isOpen && (
        <div
          className="fixed z-50 bg-nasun-black border-2 border-nasun-c4/40 rounded-xl shadow-2xl flex flex-col items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={
            isMobile
              ? { bottom: 80, left: 8, right: 8, height: 200 }
              : { bottom: 80, right: 24, width: 320, height: 200 }
          }
        >
          <button
            onClick={toggleOpen}
            className="absolute top-3 right-3 text-white/40 hover:text-white/70 transition-colors text-lg leading-none p-1"
            aria-label="Close"
          >
            &times;
          </button>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="w-8 h-8 text-white/30 mb-3"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-white/70 text-sm text-center mb-1">
            Sign in to join the conversation
          </p>
        </div>
      )}

      {/* Chat Panel */}
      {canChat && isOpen && (
        <div
          ref={panelRef}
          className="fixed z-50 bg-nasun-black border-2 border-nasun-c4/40 rounded-xl shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={panelStyle}
        >
          {/* Resize handles (edges + corners) */}
          <div
            onMouseDown={(e) => onResizeStart("n", e)}
            className="absolute top-0 left-3 right-3 h-1.5 cursor-n-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("s", e)}
            className="absolute bottom-0 left-3 right-3 h-1.5 cursor-s-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("w", e)}
            className="absolute left-0 top-3 bottom-3 w-1.5 cursor-w-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("e", e)}
            className="absolute right-0 top-3 bottom-3 w-1.5 cursor-e-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("nw", e)}
            className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("ne", e)}
            className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("sw", e)}
            className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10"
          />
          <div
            onMouseDown={(e) => onResizeStart("se", e)}
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10"
          />

          {/* Header (draggable) */}
          <div
            onMouseDown={onDragStart}
            className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02] cursor-move select-none shrink-0"
          >
            <div className="flex items-center gap-2">
              <StatusDot status={displayStatus} />
              <span className="text-sm font-medium text-white">Chat</span>
              {onlineCount > 0 && (
                <span className="text-xs text-white/40">{onlineCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Mention sound toggle */}
              <button
                onClick={toggleMentionSound}
                className={`p-1 transition-colors ${mentionSoundEnabled ? "text-white/50 hover:text-white/70" : "text-white/20 hover:text-white/40"}`}
                aria-label={
                  mentionSoundEnabled
                    ? "Mute mention alerts"
                    : "Unmute mention alerts"
                }
                title={
                  mentionSoundEnabled
                    ? "Mention alerts ON"
                    : "Mention alerts OFF"
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3.5 h-3.5"
                >
                  {mentionSoundEnabled ? (
                    <>
                      <path d="M8 1.5C6.5 1.5 5.5 2.5 5.5 4v3c0 2 -2 3 -2 3h9s-2-1-2-3V4c0-1.5-1-2.5-2.5-2.5z" />
                      <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
                    </>
                  ) : (
                    <>
                      <path d="M8 1.5C6.5 1.5 5.5 2.5 5.5 4v3c0 2 -2 3 -2 3h9s-2-1-2-3V4c0-1.5-1-2.5-2.5-2.5z" />
                      <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
                      <line x1="2" y1="2" x2="14" y2="14" />
                    </>
                  )}
                </svg>
              </button>
              {/* Reset position button */}
              {position && (
                <button
                  onClick={() => setPosition(null)}
                  className="text-white/30 hover:text-white/60 transition-colors p-1"
                  aria-label="Reset position"
                  title="Reset position"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="w-3 h-3"
                  >
                    <rect x="2" y="2" width="12" height="12" rx="2" />
                    <path d="M6 2v4H2" />
                  </svg>
                </button>
              )}
              <button
                onClick={toggleOpen}
                className="text-white/40 hover:text-white/70 transition-colors text-lg leading-none p-1"
                aria-label="Close chat"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Room Tabs */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10 shrink-0">
            {visibleRooms.map((room) => {
              const isActive = room.id === activeRoomId;
              return (
                <button
                  key={room.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchRoom(room.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                    ${isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/8'
                    }`}
                >
                  {room.name}
                </button>
              );
            })}
          </div>

          {/* Messages */}
          <MessageList
            messages={messages}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onToggleReaction={toggleReaction}
            onMention={(name) => inputRef.current?.insertMention(name)}
            currentUserId={currentUserId}
          />

          {/* Auth error banner */}
          {authError && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400 shrink-0">
              <span className="truncate">{authError}</span>
              <button
                onClick={() => setAuthError(null)}
                className="shrink-0 text-red-400/60 hover:text-red-400 transition-colors leading-none"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          )}

          {/* Input */}
          <MessageInput
            ref={inputRef}
            onSend={sendMessage}
            disabled={status !== "connected"}
          />
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-nasun-c4 hover:bg-nasun-c4/80 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {/* Mention badge */}
        {!isOpen && mentionCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-bounce">
            {mentionCount > 99 ? "99+" : mentionCount}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-white"
        >
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          )}
        </svg>
      </button>
    </>
  );
}
