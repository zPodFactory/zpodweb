import axios from "axios"
import { api } from "@/lib/api"
import { useUploadStore } from "@/stores/upload-store"
import { generateId, formatBytes } from "@/lib/utils"
import { toast } from "sonner"

const CHUNK_SIZE = 64 * 1024 * 1024 // 64 MB chunks

interface StartBackgroundUploadOptions {
  file: File
  onComplete?: () => void
}

export function startBackgroundUpload({ file, onComplete }: StartBackgroundUploadOptions) {
  const id = generateId()
  const controller = new AbortController()
  const store = useUploadStore.getState()

  store.addUpload(id, file.name, file.size, controller)

  // Fire-and-forget — run the upload in the background
  ;(async () => {
    try {
      // Check for partial upload (resume support)
      let startOffset = 0
      try {
        const { data } = await api.get<{ current_size: number }>(
          `/components/upload/${encodeURIComponent(file.name)}`
        )
        const serverSize = data?.current_size ?? 0
        if (serverSize > 0) {
          startOffset = serverSize
          toast.info(`Resuming upload from ${formatBytes(startOffset)}`)
          useUploadStore.getState().updateProgress(
            id, startOffset, file.size, (startOffset / file.size) * 100, 0, 0
          )
        }
      } catch {
        // No existing upload, start from 0
      }

      const totalSize = file.size
      let offset = startOffset
      let uploadStart = startOffset
      const startTime = Date.now()

      while (offset < totalSize) {
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }

        const end = Math.min(offset + CHUNK_SIZE, totalSize)
        const chunk = file.slice(offset, end)

        const form = new FormData()
        form.append("file", chunk)
        form.append("filename", file.name)
        form.append("offset", String(offset))
        form.append("file_size", String(totalSize))

        try {
          await api.post("/components/upload", form, {
            headers: { "Content-Type": "multipart/form-data" },
            signal: controller.signal,
          })
        } catch (err: unknown) {
          // If offset mismatch, re-sync with server and retry
          const detail = (err as { response?: { status?: number; data?: { detail?: string } } })
            ?.response?.data?.detail
          if (detail === "Offset does not match the current file size.") {
            const { data: sizeResp } = await api.get<{ current_size: number }>(
              `/components/upload/${encodeURIComponent(file.name)}`
            )
            const corrected = sizeResp?.current_size ?? 0
            toast.info(`Offset mismatch — resyncing from ${formatBytes(corrected)}`)
            offset = corrected
            uploadStart = corrected
            continue
          }
          throw err
        }

        offset = end

        const elapsed = (Date.now() - startTime) / 1000
        const uploaded = offset - uploadStart
        const speed = elapsed > 0 ? uploaded / elapsed : 0
        const remaining = totalSize - offset
        const eta = speed > 0 ? remaining / speed : 0

        useUploadStore.getState().updateProgress(
          id, offset, totalSize, (offset / totalSize) * 100, speed, eta
        )
      }

      useUploadStore.getState().completeUpload(id)
      toast.success(`Upload complete: ${file.name}`)
      onComplete?.()
    } catch (err) {
      if (axios.isCancel(err) || (err instanceof DOMException && err.name === "AbortError")) {
        useUploadStore.getState().cancelUpload(id)
        toast.info("Upload cancelled")
      } else {
        const message = err instanceof Error ? err.message : "Unknown error"
        useUploadStore.getState().failUpload(id, message)
        toast.error("Upload failed", { description: message })
      }
    }
  })()

  return id
}
