import { create } from "zustand"

export type UploadStatus = "uploading" | "done" | "failed" | "cancelled"

export interface UploadEntry {
  id: string
  filename: string
  progress: number // 0-100
  loaded: number
  total: number
  speed: number
  eta: number
  status: UploadStatus
  error?: string
  abortController: AbortController
}

interface UploadState {
  uploads: Map<string, UploadEntry>
  addUpload: (id: string, filename: string, total: number, abortController: AbortController) => void
  updateProgress: (id: string, loaded: number, total: number, percent: number, speed: number, eta: number) => void
  completeUpload: (id: string) => void
  failUpload: (id: string, error: string) => void
  cancelUpload: (id: string) => void
  removeUpload: (id: string) => void
  clearCompleted: () => void
}

export const useUploadStore = create<UploadState>()((set, get) => ({
  uploads: new Map(),

  addUpload: (id, filename, total, abortController) =>
    set((state) => {
      const uploads = new Map(state.uploads)
      uploads.set(id, {
        id,
        filename,
        progress: 0,
        loaded: 0,
        total,
        speed: 0,
        eta: 0,
        status: "uploading",
        abortController,
      })
      return { uploads }
    }),

  updateProgress: (id, loaded, total, percent, speed, eta) =>
    set((state) => {
      const entry = state.uploads.get(id)
      if (!entry) return state
      const uploads = new Map(state.uploads)
      uploads.set(id, { ...entry, loaded, total, progress: percent, speed, eta })
      return { uploads }
    }),

  completeUpload: (id) =>
    set((state) => {
      const entry = state.uploads.get(id)
      if (!entry) return state
      const uploads = new Map(state.uploads)
      uploads.set(id, { ...entry, status: "done", progress: 100 })
      return { uploads }
    }),

  failUpload: (id, error) =>
    set((state) => {
      const entry = state.uploads.get(id)
      if (!entry) return state
      const uploads = new Map(state.uploads)
      uploads.set(id, { ...entry, status: "failed", error })
      return { uploads }
    }),

  cancelUpload: (id) => {
    const entry = get().uploads.get(id)
    if (!entry) return
    entry.abortController.abort()
    set((state) => {
      const uploads = new Map(state.uploads)
      uploads.set(id, { ...entry, status: "cancelled" })
      return { uploads }
    })
  },

  removeUpload: (id) =>
    set((state) => {
      const uploads = new Map(state.uploads)
      uploads.delete(id)
      return { uploads }
    }),

  clearCompleted: () =>
    set((state) => {
      const uploads = new Map(state.uploads)
      for (const [id, entry] of uploads) {
        if (entry.status !== "uploading") uploads.delete(id)
      }
      return { uploads }
    }),
}))
