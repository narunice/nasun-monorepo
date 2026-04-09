import { useChat } from '../hooks/useChat';
import { useChatStore } from '../../../store/chatStore';
import { useUserStore } from '../../../store/userStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

function StatusDot({ status }: { status: string }) {
  const color = status === 'connected' ? 'bg-green-400' : status === 'connecting' ? 'bg-yellow-400' : 'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export default function ChatWidget() {
  const { messages, status, onlineCount, hasMore, sendMessage, loadMore, canChat } = useChat();
  const isOpen = useChatStore((s) => s.isOpen);
  const toggleOpen = useChatStore((s) => s.toggleOpen);
  const currentUserId = useUserStore((s) => s.user?.identityId);

  if (!canChat) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="w-80 sm:w-96 h-[480px] bg-nasun-black border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <StatusDot status={status} />
              <span className="text-sm font-medium text-white">Community Chat</span>
              {onlineCount > 0 && (
                <span className="text-xs text-white/40">{onlineCount} online</span>
              )}
            </div>
            <button
              onClick={toggleOpen}
              className="text-white/40 hover:text-white/70 transition-colors text-lg leading-none"
              aria-label="Close chat"
            >
              &times;
            </button>
          </div>

          <MessageList
            messages={messages}
            hasMore={hasMore}
            onLoadMore={loadMore}
            currentUserId={currentUserId}
          />

          <MessageInput
            onSend={sendMessage}
            disabled={status !== 'connected'}
          />
        </div>
      )}

      <button
        onClick={toggleOpen}
        className="w-12 h-12 bg-nasun-c4 hover:bg-nasun-c4/80 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
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
    </div>
  );
}
