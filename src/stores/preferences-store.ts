import { create } from "zustand"
import { persist } from "zustand/middleware"

export type NetworksView = "table" | "topology"
export type NetworkGroupsOpen = Record<"zpod" | "zcore" | "user", boolean>

interface PreferencesState {
  pollingInterval: number // seconds, 0 = disabled
  setPollingInterval: (seconds: number) => void
  // zPod detail, Networks card: the last tab used and which kind groups are open
  networksView: NetworksView
  setNetworksView: (view: NetworksView) => void
  networkGroupsOpen: NetworkGroupsOpen
  setNetworkGroupOpen: (kind: keyof NetworkGroupsOpen, open: boolean) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      pollingInterval: 5,
      setPollingInterval: (seconds) => set({ pollingInterval: seconds }),
      networksView: "table",
      setNetworksView: (view) => set({ networksView: view }),
      // User networks are the ones acted on; the zPod's and zcore's own start folded.
      networkGroupsOpen: { zpod: false, zcore: false, user: true },
      setNetworkGroupOpen: (kind, open) =>
        set((s) => ({ networkGroupsOpen: { ...s.networkGroupsOpen, [kind]: open } })),
    }),
    { name: "zpodweb-preferences" }
  )
)
