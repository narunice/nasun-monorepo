import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  soundEnabled: boolean
  soundVolume: number
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  toggleSound: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: false,
      soundVolume: 0.5,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setSoundVolume: (volume) => set({ soundVolume: Math.max(0, Math.min(1, volume)) }),
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
    }),
    {
      name: 'gostop:settings',
    }
  )
)

/**
 * Hook alias matching the old useNotificationPrefs API for easier migration.
 */
export function useNotificationPrefs() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  return { soundEnabled, soundVolume }
}
