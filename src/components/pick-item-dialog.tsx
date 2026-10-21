import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"

export interface PickItem {
  id: number
  label: string
}

interface PickItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  label: string
  /** Noun used in the placeholder, e.g. "user" */
  itemName: string
  items: PickItem[]
  onConfirm: (id: number) => Promise<void>
  confirmText?: string
}

export function PickItemDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  itemName,
  items,
  onConfirm,
  confirmText = "Add",
}: PickItemDialogProps) {
  const [selection, setSelection] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setSelection("")
  }, [open])

  const handleConfirm = async () => {
    if (!selection) return
    setSaving(true)
    try {
      await onConfirm(Number(selection))
      onOpenChange(false)
    } catch {
      // Caller reports the error; keep the dialog open
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <Select value={selection} onValueChange={setSelection}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    items.length === 0 ? `No ${itemName}s available` : `Select a ${itemName}`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selection || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
