/**
 * Procedural sound effects via Web Audio API. Ported from pado lib/sounds.ts.
 * No external audio files. Respects gostop notification preferences.
 */

import { useSettingsStore } from '../store/useSettingsStore'

export type GameSound = 'winSmall' | 'winMedium' | 'winJackpot'

interface ToneParams {
  frequency: number
  duration: number
  type: OscillatorType
  rampTo?: number
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx
  try {
    audioCtx = new AudioContext()
    return audioCtx
  } catch {
    return null
  }
}

function playTone(
  ctx: AudioContext,
  tone: ToneParams,
  volume: number,
  startTime: number,
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = tone.type
  osc.frequency.setValueAtTime(tone.frequency, startTime)
  if (tone.rampTo) {
    osc.frequency.linearRampToValueAtTime(tone.rampTo, startTime + tone.duration)
  }

  gain.gain.setValueAtTime(volume * 0.3, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + tone.duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(startTime + tone.duration)
}

const GAME_SOUND_DEFS: Record<GameSound, ToneParams[]> = {
  winSmall: [{ frequency: 880, duration: 0.15, type: 'sine' }],
  winMedium: [
    { frequency: 660, duration: 0.12, type: 'sine' },
    { frequency: 880, duration: 0.15, type: 'sine' },
  ],
  // Rising arpeggio C-E-G-C
  winJackpot: [
    { frequency: 523, duration: 0.1, type: 'sine' },
    { frequency: 659, duration: 0.1, type: 'sine' },
    { frequency: 784, duration: 0.1, type: 'sine' },
    { frequency: 1047, duration: 0.25, type: 'sine' },
  ],
}

export function playGameSound(sound: GameSound): void {
  const { soundEnabled, soundVolume: volume } = useSettingsStore.getState()
  if (!soundEnabled) return

  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const tones = GAME_SOUND_DEFS[sound]
  let offset = ctx.currentTime
  for (const tone of tones) {
    playTone(ctx, tone, volume, offset)
    offset += tone.duration + 0.03
  }
}
