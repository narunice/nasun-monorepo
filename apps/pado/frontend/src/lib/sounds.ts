/**
 * Trading Sound System
 *
 * Web Audio API-based sound effects for trading events.
 * No external audio files needed — generates tones programmatically.
 * Respects user preferences (sound enabled, volume).
 */

import { getNotificationPrefs } from './notification-preferences';

export type TradingSound =
  | 'orderPlaced'
  | 'orderFilled'
  | 'tpslTriggered'
  | 'priceAlert'
  | 'error';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

interface ToneParams {
  frequency: number;
  duration: number; // seconds
  type: OscillatorType;
  rampTo?: number; // frequency ramp target
}

function playTone(ctx: AudioContext, tone: ToneParams, volume: number, startTime: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.frequency, startTime);
  if (tone.rampTo) {
    osc.frequency.linearRampToValueAtTime(tone.rampTo, startTime + tone.duration);
  }

  gain.gain.setValueAtTime(volume * 0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + tone.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + tone.duration);
}

// Sound definitions: each is a sequence of tones
const SOUND_DEFS: Record<TradingSound, ToneParams[]> = {
  // Short click — order submitted
  orderPlaced: [
    { frequency: 800, duration: 0.08, type: 'sine' },
  ],
  // Rising 2-tone — order filled
  orderFilled: [
    { frequency: 600, duration: 0.1, type: 'sine' },
    { frequency: 900, duration: 0.12, type: 'sine' },
  ],
  // 3-tone chime — TP/SL triggered
  tpslTriggered: [
    { frequency: 800, duration: 0.1, type: 'sine' },
    { frequency: 1000, duration: 0.1, type: 'sine' },
    { frequency: 1200, duration: 0.15, type: 'sine' },
  ],
  // Double bell — price alert reached
  priceAlert: [
    { frequency: 1000, duration: 0.15, type: 'sine' },
    { frequency: 1000, duration: 0.15, type: 'sine' },
  ],
  // Descending tone — error
  error: [
    { frequency: 400, duration: 0.2, type: 'sine', rampTo: 250 },
  ],
};

/**
 * Play a trading sound effect.
 * Respects user notification preferences (soundEnabled, soundVolume).
 * Silently fails if AudioContext is unavailable.
 */
export function playSound(sound: TradingSound): void {
  const prefs = getNotificationPrefs();
  if (!prefs.soundEnabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume AudioContext if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const tones = SOUND_DEFS[sound];
  const volume = prefs.soundVolume;
  let offset = ctx.currentTime;

  for (const tone of tones) {
    playTone(ctx, tone, volume, offset);
    offset += tone.duration + 0.03; // 30ms gap between tones
  }
}
