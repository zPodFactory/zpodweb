import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { TargetProfile } from "@/types"

interface TargetState {
  targets: TargetProfile[]
  activeTargetId: string | null
  addTarget: (target: TargetProfile) => void
  updateTarget: (id: string, updates: Partial<TargetProfile>) => void
  removeTarget: (id: string) => void
  setActiveTarget: (id: string) => void
  clearActiveTarget: () => void
}

export const useTargetStore = create<TargetState>()(
  persist(
    (set) => ({
      targets: [],
      activeTargetId: null,
      addTarget: (target) =>
        set((state) => ({ targets: [...state.targets, target] })),
      updateTarget: (id, updates) =>
        set((state) => ({
          targets: state.targets.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),
      removeTarget: (id) =>
        set((state) => ({
          targets: state.targets.filter((t) => t.id !== id),
          activeTargetId:
            state.activeTargetId === id ? null : state.activeTargetId,
        })),
      setActiveTarget: (id) => set({ activeTargetId: id }),
      clearActiveTarget: () => set({ activeTargetId: null }),
    }),
    { name: "zpodweb-targets" }
  )
)
