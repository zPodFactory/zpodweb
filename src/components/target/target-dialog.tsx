import { useState, useEffect } from "react"
import { generateId } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TargetProfile } from "@/types"

interface TargetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: TargetProfile | null
  onSave: (target: TargetProfile) => void
}

export function TargetDialog({
  open,
  onOpenChange,
  target,
  onSave,
}: TargetDialogProps) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [token, setToken] = useState("")

  useEffect(() => {
    if (target) {
      setName(target.name)
      setUrl(target.url)
      setToken(target.token)
    } else {
      setName("")
      setUrl("")
      setToken("")
    }
  }, [target, open])

  function handleSave() {
    if (!name || !url || !token) return
    onSave({
      id: target?.id ?? generateId(),
      name,
      url: url.replace(/\/+$/, ""),
      token,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target ? "Edit Target" : "Add Target"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My zPodFactory"
            />
          </div>
          <div className="space-y-2">
            <Label>API URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://172.16.0.10:8000"
            />
          </div>
          <div className="space-y-2">
            <Label>API Token</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter access token"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || !url || !token}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
