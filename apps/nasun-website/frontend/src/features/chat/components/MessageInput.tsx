import { useState, useCallback, useImperativeHandle, useRef, forwardRef, type KeyboardEvent } from 'react';

const MAX_LENGTH = 500;

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export interface MessageInputHandle {
  insertMention: (name: string) => void;
}

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(({ onSend, disabled }, ref) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    insertMention(name: string) {
      // Use bracket format for names with spaces/special chars, plain for simple names
      const needsBrackets = /[^a-zA-Z0-9_#-]/.test(name);
      const mention = needsBrackets ? `@[${name}] ` : `@${name} `;
      setValue((prev) => {
        const next = prev ? `${prev}${mention}` : mention;
        return next.slice(0, MAX_LENGTH);
      });
      // Focus the textarea after inserting
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
  }));

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent parent components or browser extensions from intercepting key events
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 p-3 border-t border-white/10">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Connecting...' : 'Type a message...'}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-nasun-c4/50 disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="px-3 py-2 bg-nasun-c4 text-white rounded-lg text-sm font-medium hover:bg-nasun-c4/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Send
      </button>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';
export default MessageInput;
