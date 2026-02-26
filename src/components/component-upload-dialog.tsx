import { useCallback, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Upload, FileUp } from "lucide-react"
import { formatBytes } from "@/lib/utils"
import { startBackgroundUpload } from "@/lib/upload-manager"

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
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) reset()
      onOpenChange(isOpen)
    },
    [reset, onOpenChange]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files
      if (selected && selected.length > 0) {
        setFiles(Array.from(selected))
      }
    },
    []
  )

  const handleUpload = useCallback(() => {
    if (files.length === 0) return
    for (const file of files) {
      startBackgroundUpload({ file, onComplete: onUploadComplete })
    }
    const msg = files.length === 1
      ? `Upload started: ${files[0].name}`
      : `${files.length} uploads started`
    toast.info(msg)
    handleClose(false)
  }, [files, onUploadComplete, handleClose])

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

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
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {files.length > 0 ? (
              <>
                <FileUp className="h-8 w-8 text-primary" />
                <div className="text-center">
                  {files.length === 1 ? (
                    <p className="text-sm font-medium truncate max-w-[350px]">
                      {files[0].name}
                    </p>
                  ) : (
                    <p className="text-sm font-medium">
                      {files.length} files selected
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(totalSize)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Click to select component files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    OVA, ISO, or other binary files
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Selected file list (when multiple) */}
          {files.length > 1 && (
            <div className="max-h-[120px] overflow-y-auto space-y-1 text-xs text-muted-foreground">
              {files.map((f, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate mr-2">{f.name}</span>
                  <span className="shrink-0">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={files.length === 0}
            >
              <Upload className="mr-1 h-3 w-3" />
              Upload{files.length > 1 ? ` (${files.length})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
