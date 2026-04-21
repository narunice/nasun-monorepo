import { useState, useRef, useEffect, useCallback } from 'react';
import type { RoomInfo } from '../types';

interface Props {
  marketRooms: RoomInfo[];
  languageRooms: RoomInfo[];
  activeRoomId: number;
  selectedLanguageRoomId: number;
  unreadCounts: Record<number, number>;
  onSelectRoom: (roomId: number) => void;
  onSelectLanguage: (roomId: number) => void;
}

function isLanguageRoom(roomId: number): boolean {
  return roomId < 100;
}

export function ChatRoomTabs({
  marketRooms, languageRooms, activeRoomId, selectedLanguageRoomId,
  unreadCounts, onSelectRoom, onSelectLanguage,
}: Props) {
  const isGlobalActive = isLanguageRoom(activeRoomId);
  const [langOpen, setLangOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [langOpen]);

  const openDropdown = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setLangOpen((v) => !v);
  }, []);

  const globalUnread = languageRooms.reduce(
    (sum, r) => sum + (unreadCounts[r.id] ?? 0), 0,
  );

  const selectedLangName = languageRooms.find((r) => r.id === selectedLanguageRoomId)?.name ?? 'GM';

  return (
    <div role="tablist" aria-label="Chat rooms" className="flex items-center gap-1 px-2 py-1.5 border-b border-theme-border shrink-0 overflow-x-auto scrollbar-none">
      {/* Language room selector */}
      <div ref={dropdownRef} className="relative shrink-0">
        <button
          ref={triggerRef}
          onClick={() => {
            if (!isGlobalActive) onSelectRoom(selectedLanguageRoomId);
            openDropdown();
          }}
          className={`flex items-center gap-0.5 px-2.5 py-1 rounded-full text-trading-xs font-medium
            whitespace-nowrap transition-colors
            ${isGlobalActive
              ? 'bg-theme-accent/15 text-theme-accent'
              : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary'
            }`}
        >
          {selectedLangName}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`shrink-0 opacity-60 transition-transform ${langOpen ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Custom dropdown */}
        {langOpen && (
          <div
            className="fixed min-w-[120px] py-1 rounded-lg
              bg-theme-bg-secondary border border-theme-border shadow-lg z-[9999]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {languageRooms.map((room) => {
              const isSelected = room.id === selectedLanguageRoomId;
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    onSelectLanguage(room.id);
                    onSelectRoom(room.id);
                    setLangOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-trading-xs transition-colors
                    ${isSelected
                      ? 'text-theme-accent font-medium'
                      : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
                    }`}
                >
                  {room.name}
                </button>
              );
            })}
          </div>
        )}

        {globalUnread > 0 && !isGlobalActive && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full
            bg-theme-accent text-white text-[10px] font-bold
            flex items-center justify-center leading-none z-10 pointer-events-none">
            {globalUnread > 99 ? '99+' : globalUnread}
          </span>
        )}
      </div>

      {/* Market room tabs */}
      {marketRooms.map((room) => {
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
