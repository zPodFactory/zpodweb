import { useCallback, useRef, useState } from "react"
import { useApi, type UploadProgress } from "@/hooks/use-api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Upload, X, FileUp, CheckCircle2 } from "lucide-react"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "--"
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = Math.ceil(seconds % 60)
    return `${m}m ${s}s`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.ceil((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

const CHUNK_SIZE = 64 * 1024 * 1024 // 64 MB chunks

interface ComponentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadComplete: () => void
}

export function ComponentUploadDialog({
  open,
  onOpenChange,
  onUploadComplete,
}: ComponentUploadDialogProps) {
  const { getUploadedFileSize, uploadComponentChunk } = useApi()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [done, setDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setFile(null)
    setUploading(false)
    setProgress(null)
    setDone(false)
    abortRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && uploading) {
        abortRef.current?.abort()
      }
      if (!isOpen) reset()
      onOpenChange(isOpen)
    },
    [uploading, reset, onOpenChange]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) {
        setFile(selected)
        setDone(false)
        setProgress(null)
      }
    },
    []
  )

  const handleUpload = useCallback(async () => {
    if (!file) return

    setUploading(true)
    setDone(false)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Check if a partial upload already exists (resume support)
      const existingSize = await getUploadedFileSize(file.name)
      const startOffset = existingSize > 0 ? existingSize : 0

      if (startOffset > 0) {
        toast.info(`Resuming upload from ${formatBytes(startOffset)}`)
        setProgress({
          loaded: startOffset,
          total: file.size,
          percent: (startOffset / file.size) * 100,
          speed: 0,
          eta: 0,
        })
      }

      await uploadComponentChunk(
        file,
        CHUNK_SIZE,
        startOffset,
        setProgress,
        controller.signal
      )

      setDone(true)
      toast.success(`Upload complete: ${file.name}`)
      onUploadComplete()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Upload cancelled")
      } else {
        toast.error("Upload failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    } finally {
      setUploading(false)
    }
  }, [file, getUploadedFileSize, uploadComponentChunk, onUploadComplete])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Component</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div
            className="flex flex-col items-center gap-3 border border-dashed p-6 cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/50"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {file ? (
              <>
                <FileUp className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium truncate max-w-[350px]">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Click to select a component file
                  </p>
                  <p className="text-xs text-muted-foreground">
                    OVA, ISO, or other binary files
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Progress section */}
          {progress && (
            <div className="space-y-2">
              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden bg-muted">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${progress.percent}%`,
                    backgroundColor: done
                      ? "#a6e3a1"
                      : "#cba6f7",
                  }}
                />
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                </span>
                <span>{progress.percent.toFixed(1)}%</span>
              </div>

              {uploading && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatSpeed(progress.speed)}</span>
                  <span>ETA: {formatEta(progress.eta)}</span>
                </div>
              )}

              {done && (
                <div className="flex items-center gap-2 text-sm text-[#a6e3a1]">
                  <CheckCircle2 className="h-4 w-4" />
                  Upload complete
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {uploading ? (
              <Button variant="destructive" size="sm" onClick={handleCancel}>
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            ) : done ? (
              <Button size="sm" onClick={() => handleClose(false)}>
                Close
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={!file}
              >
                <Upload className="mr-1 h-3 w-3" />
                Upload
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
