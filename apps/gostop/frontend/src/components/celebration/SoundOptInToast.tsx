/**
 * SoundOptInToast — surfaces a one-time prompt the first time a big/jackpot
 * win fires while sound is disabled. Persisted via localStorage so a user
 * who declines is never asked again.
 *
 * Implementation note: we render via a tiny custom DOM element (not the
 * existing ToastProvider) because the current ToastProvider does not
 * support action buttons. Keeping it self-contained avoids modifying the
 * shared toast system in this PR.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getNotificationPrefs, setNotificationPrefs } from '../../lib/notification-preferences'

const PROMPTED_KEY = 'gostop:sound:prompted'

let listeners: Array<() => void> = []

/**
 * Called by CelebrationOverlayHost on each big/jackpot fire. Idempotent —
 * the toast itself decides whether it should show.
 */
export function triggerSoundOptInPrompt(): void {
  if (typeof window === 'undefined') return
  if (getNotificationPrefs().soundEnabled) return
  if (localStorage.getItem(PROMPTED_KEY) === '1') return
  for (const fn of listeners) fn()
}

export function SoundOptInToast() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onTrigger = () => {
      // Re-check at fire time in case another tab updated prefs.
      if (getNotificationPrefs().soundEnabled) return
      if (localStorage.getItem(PROMPTED_KEY) === '1') return
      setShow(true)
    }
    listeners.push(onTrigger)
    return () => {
      listeners = listeners.filter((fn) => fn !== onTrigger)
    }
  }, [])

  if (!show || typeof document === 'undefined') return null

  function dismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PROMPTED_KEY, '1')
    }
    setShow(false)
  }

  function enable() {
    setNotificationPrefs({ soundEnabled: true })
    dismiss()
  }

  return createPortal(
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] panel p-4 max-w-sm w-[calc(100vw-2rem)] flex items-center gap-3 shadow-gold-glow-lg pointer-events-auto"
      role="alertdialog"
      aria-label="Enable celebration sound"
    >
      <svg
        className="w-6 h-6 text-gold-300 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.536 8.464a5 5 0 010 7.072M19.07 4.929a10 10 0 010 14.142M9 9H5l5-5v16l-5-5H9V9z"
        />
      </svg>
      <p className="flex-1 text-sm text-neutral-200">
        Enable celebration sound for full effect?
      </p>
      <button
        onClick={enable}
        className="btn-gold !py-1.5 !px-3 text-xs"
      >
        Enable
      </button>
      <button
        onClick={dismiss}
        className="btn-ghost !py-1.5 !px-3 text-xs"
      >
        Not now
      </button>
    </div>,
    document.body,
  )
}
