import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pado_chat_visible';

export function useChatPanel() {
  const [isVisible, setIsVisible] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setIsVisible((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const show = useCallback(() => {
    setIsVisible(true);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* noop */ }
  }, []);

  const hide = useCallback(() => {
    setIsVisible(false);
    try { localStorage.setItem(STORAGE_KEY, 'false'); } catch { /* noop */ }
  }, []);

  return { isVisible, toggle, show, hide };
}
