import { create } from "zustand"
import { persist } from "zustand/middleware"

interface PreferencesState {
  pollingInterval: number // seconds, 0 = disabled
  setPollingInterval: (seconds: number) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      pollingInterval: 5,
      setPollingInterval: (seconds) => set({ pollingInterval: seconds }),
    }),
    { name: "zpodweb-preferences" }
  )
)
