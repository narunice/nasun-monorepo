import { useRef, useMemo, useState, useEffect } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useUserStore } from "@/store/userStore";
import { useChatStore } from "@/store/chatStore";
import { useChat } from "@/features/chat";
import MessageList from "@/features/chat/components/MessageList";
import MessageInput, { type MessageInputHandle } from "@/features/chat/components/MessageInput";
import { SetNicknameModal } from "@/features/chat/components/SetNicknameModal";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SIDEBAR_ROOM_IDS = new Set([0, 10]); // GM + General only (Pado is for Pado app)

export function UjuChatSidebar() {
  const currentUserId = useUserStore((s) => s.user?.walletAddress ?? s.user?.identityId);
  const authError = useChatStore((s) => s.authError);
  const {
    messages, displayStatus, onlineCount, hasMore,
    rooms, activeRoomId,
    sendMessage, loadMore, switchRoom, toggleReaction,
    canChat, nickname, needsNickname, nicknameRateLimit,
    setTurnstileToken, turnstileKey,
  } = useChat();

  const inputRef = useRef<MessageInputHandle>(null);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);

  useEffect(() => {
    if (needsNickname) setNicknameModalOpen(true);
  }, [needsNickname]);

  const sidebarRooms = useMemo(
    () => rooms.filter((r) => SIDEBAR_ROOM_IDS.has(r.id)),
    [rooms],
  );

  return (
    <div className="flex flex-col h-full bg-uju-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-uju-border shrink-0">
        <span className="text-sm font-medium text-uju-primary">Community Chat</span>
        <span className="text-sm text-uju-secondary">{onlineCount} online</span>
      </div>

      {/* Room tabs */}
      <div className="flex border-b border-uju-border shrink-0">
        {sidebarRooms.map((room) => (
          <button
            key={room.id}
            onClick={() => switchRoom(room.id)}
            className={`flex-1 py-2 text-sm font-medium transition-colors
              ${activeRoomId === room.id
                ? "text-pado-3 border-b-2 border-pado-3 -mb-px"
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

      {/* Nickname modal */}
      {nicknameModalOpen && canChat && currentUserId && (
        <SetNicknameModal
          addressSuffix={currentUserId.slice(-4)}
          currentNickname={nickname ?? undefined}
          rateLimit={nicknameRateLimit ?? undefined}
          onSuccess={() => setNicknameModalOpen(false)}
          onClose={() => setNicknameModalOpen(false)}
        />
      )}

      {/* Invisible Turnstile CAPTCHA */}
      {TURNSTILE_SITE_KEY && canChat && (
        <Turnstile
          key={turnstileKey}
          siteKey={TURNSTILE_SITE_KEY}
          options={{ appearance: "execute", size: "invisible" }}
          onSuccess={setTurnstileToken}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
