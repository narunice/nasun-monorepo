import { useRef, useMemo } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useUserStore } from "@/store/userStore";
import { useChatStore } from "@/store/chatStore";
import { useChat } from "@/features/chat";
import MessageList from "@/features/chat/components/MessageList";
import MessageInput, { type MessageInputHandle } from "@/features/chat/components/MessageInput";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SIDEBAR_ROOM_IDS = new Set([0, 10]); // GM + General only (Pado is for Pado app)

export function UjuChatSidebar({ onClose }: { onClose?: () => void } = {}) {
  const currentUserId = useUserStore((s) => s.user?.walletAddress ?? s.user?.identityId);
  const authError = useChatStore((s) => s.authError);
  const {
    messages, displayStatus, onlineCount, hasMore,
    rooms, activeRoomId,
    sendMessage, loadMore, switchRoom, toggleReaction,
    canChat,
    setTurnstileToken, turnstileKey, onTurnstileError, onTurnstileExpire,
  } = useChat();

  const inputRef = useRef<MessageInputHandle>(null);

  const sidebarRooms = useMemo(
    () => rooms.filter((r) => SIDEBAR_ROOM_IDS.has(r.id)),
    [rooms],
  );

  return (
    <div className="flex flex-col h-full bg-gray-950/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-uju-border/60 shrink-0">
        <span className="text-sm font-light text-uju-primary">Chat</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-uju-secondary">{onlineCount} online</span>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center text-uju-secondary hover:text-uju-primary hover:bg-uju-bg/60"
              aria-label="Close chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Room tabs */}
      <div className="flex border-b border-uju-border/60 shrink-0">
        {sidebarRooms.map((room) => (
          <button
            key={room.id}
            onClick={() => switchRoom(room.id)}
            className={`flex-1 py-2 text-sm font-light transition-colors
              ${activeRoomId === room.id
                ? "text-pado-2 border-b-2 border-pado-2 -mb-px"
                : "text-uju-secondary hover:text-uju-primary"}`}
          >
            {room.name}
          </button>
        ))}
      </div>

      {/* Auth error banner */}
      {authError && (
        <div className="px-3 py-2 bg-nasun-scarlet/10 border-b border-nasun-scarlet/30 shrink-0">
          <p className="text-sm text-nasun-scarlet">{authError}</p>
        </div>
      )}

      {/* Messages or not-connected prompt */}
      {canChat ? (
        <MessageList
          messages={messages}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onToggleReaction={toggleReaction}
          onMention={(name) => inputRef.current?.insertMention(name)}
          currentUserId={currentUserId}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-uju-secondary text-center px-4">
            Connect a wallet to join the chat
          </p>
        </div>
      )}

      {/* Input */}
      {canChat && (
        <MessageInput
          ref={inputRef}
          onSend={sendMessage}
          disabled={displayStatus !== "connected"}
        />
      )}

      {/* Nickname modal is hoisted to UjuPage so it survives sidebar
          conditional unmount on tab switches. */}

      {/* size:'invisible' renders nothing for clean IPs; CF auto-escalates
          with its own modal when interactive challenge is needed. Host element
          stays in normal flow (NOT display:none) so the iframe remains
          interactable. Previous display:none + appearance:'execute' combo
          trapped users on suspicious-IP networks (2026-05-09 outage). */}
      {TURNSTILE_SITE_KEY && canChat && (
        <Turnstile
          key={turnstileKey}
          siteKey={TURNSTILE_SITE_KEY}
          options={{ size: "invisible" }}
          onSuccess={setTurnstileToken}
          onError={onTurnstileError}
          onExpire={onTurnstileExpire}
        />
      )}
    </div>
  );
}
