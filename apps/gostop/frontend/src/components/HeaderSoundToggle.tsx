/**
 * HeaderSoundToggle — click toggles celebration sound on/off.
 * Volume is fixed at the default; volume slider is deferred (Stage A MVP).
 *
 * Sound default is OFF (a11y-first). The first big/jackpot win that fires
 * while sound is off surfaces a one-time "Enable sound?" prompt
 * (SoundOptInToast).
 */

import { useSettingsStore } from '../store/useSettingsStore'

export function HeaderSoundToggle() {
  const enabled = useSettingsStore((s) => s.soundEnabled)
  const toggle = useSettingsStore((s) => s.toggleSound)

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? 'Sound enabled — click to mute' : 'Sound muted — click to enable'}
      aria-pressed={enabled}
      title={enabled ? 'Mute sound' : 'Enable sound'}
      className={`w-11 h-11 flex items-center justify-center rounded-full border transition-colors ${
        enabled
          ? 'border-gold-200/60 text-gold-200 hover:border-gold-200'
          : 'border-gold-subtle text-neutral-400 hover:text-gold-200'
      }`}
    >
      {enabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  )
}

function SpeakerOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"
      />
    </svg>
  )
}

function SpeakerOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"
      />
    </svg>
  )
}
