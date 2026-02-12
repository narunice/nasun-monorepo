import type { RoomInfo } from '../types';

interface Props {
  rooms: RoomInfo[];
  activeRoomId: number;
  unreadCounts: Record<number, number>;
  onSelectRoom: (roomId: number) => void;
}

export function ChatRoomTabs({ rooms, activeRoomId, unreadCounts, onSelectRoom }: Props) {
  return (
    <div role="tablist" aria-label="Chat rooms" className="flex items-center gap-1 px-2 py-1.5 border-b border-theme-border shrink-0 overflow-x-auto scrollbar-none">
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        const unread = unreadCounts[room.id] ?? 0;
        return (
          <button
            key={room.id}
            role="tab"
            aria-selected={isActive}
            aria-label={`${room.name} chat room${unread > 0 ? `, ${unread} unread` : ''}`}
            onClick={() => onSelectRoom(room.id)}
            className={`relative px-2.5 py-1 rounded-full text-trading-xs font-medium
              whitespace-nowrap transition-colors shrink-0
              ${isActive
                ? 'bg-theme-accent/15 text-theme-accent'
                : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary'
              }`}
          >
            {room.name}
            {unread > 0 && !isActive && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full
                bg-theme-accent text-white text-[10px] font-bold
                flex items-center justify-center leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
