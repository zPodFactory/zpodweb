import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Upload } from "lucide-react"
import { ProfileTrunk } from "@/components/profile-trunk"
import { extractComponentType } from "@/lib/component-colors"
import type { ComponentFull, ProfileItem, ProfileItemCreate } from "@/types"

interface ProfileImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  components: ComponentFull[]
  onImport: (name: string, profile: (ProfileItemCreate | ProfileItemCreate[])[]) => void
  saving: boolean
}

interface ParseResult {
  name: string
  profile: (ProfileItemCreate | ProfileItemCreate[])[]
  errors: string[]
  flatItems: ProfileItem[]
}

function parseAndValidate(
  json: string,
  components: ComponentFull[]
): ParseResult {
  const empty: ParseResult = { name: "", profile: [], errors: [], flatItems: [] }

  if (!json.trim()) return empty

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ...empty, errors: ["Invalid JSON syntax"] }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...empty, errors: ["JSON must be an object with a \"profile\" array"] }
  }

  const obj = parsed as Record<string, unknown>
  const name = typeof obj.name === "string" ? obj.name : ""

  if (!Array.isArray(obj.profile)) {
    return { ...empty, name, errors: ["Missing or invalid \"profile\" array"] }
  }

  const errors: string[] = []
  const profile = obj.profile as (ProfileItemCreate | ProfileItemCreate[])[]
  const activeUids = new Set(
    components.filter((c) => c.status === "ACTIVE").map((c) => c.component_uid)
  )

  // Validate first step is single zbox
  const firstStep = profile[0]
  if (firstStep) {
    const firstItem = Array.isArray(firstStep) ? firstStep[0] : firstStep
    if (!firstItem || extractComponentType(firstItem.component_uid) !== "zbox") {
      errors.push("First step must be a single zbox component")
    }
    if (Array.isArray(firstStep)) {
      errors.push("First step must be a single zbox component, not a parallel group")
    }
  } else {
    errors.push("Profile must contain at least one step")
  }

  // Validate all component_uids exist
  const flatItems: ProfileItem[] = []
  for (const step of profile) {
    const items = Array.isArray(step) ? step : [step]
    for (const item of items) {
      if (!item.component_uid) {
        errors.push("Each item must have a component_uid")
        continue
      }
      if (!activeUids.has(item.component_uid)) {
        errors.push(`Component "${item.component_uid}" is not available (not found or not ACTIVE)`)
      }
      flatItems.push({
        component_uid: item.component_uid,
        host_id: item.host_id ?? null,
        hostname: item.hostname ?? null,
        vcpu: item.vcpu ?? null,
        vmem: item.vmem ?? null,
        vnics: item.vnics ?? null,
        vdisks: item.vdisks ?? null,
      })
    }
  }

  // Deduplicate errors
  const uniqueErrors = [...new Set(errors)]

  return { name, profile, errors: uniqueErrors, flatItems }
}

export function ProfileImportDialog({
  open,
  onOpenChange,
  components,
  onImport,
  saving,
}: ProfileImportDialogProps) {
  const [json, setJson] = useState("")
  const [name, setName] = useState("")
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const result = parseAndValidate(json, components)

  // Pre-fill name from JSON when it changes (unless user manually edited)
  useEffect(() => {
    if (result.name && !nameManuallyEdited) {
      setName(result.name)
    }
  }, [result.name, nameManuallyEdited])

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setJson("")
      setName("")
      setNameManuallyEdited(false)
    }
  }, [open])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result
      if (typeof text === "string") {
        setJson(text)
        setNameManuallyEdited(false)
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-selected
    e.target.value = ""
  }, [])

  const hasContent = json.trim().length > 0
  const hasErrors = result.errors.length > 0
  const canImport = hasContent && !hasErrors && name.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Profile</DialogTitle>
          <DialogDescription>
            Paste a profile JSON or upload a .json file to import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* JSON input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="import-json">Profile JSON</Label>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
                Upload .json
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
            <textarea
              id="import-json"
              className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              placeholder='{"name": "my-profile", "profile": [...]}'
              value={json}
              onChange={(e) => {
                setJson(e.target.value)
                setNameManuallyEdited(false)
              }}
            />
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="import-name">Profile Name</Label>
            <Input
              id="import-name"
              placeholder="Enter profile name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameManuallyEdited(true)
              }}
            />
          </div>

          {/* Validation errors */}
          {hasContent && hasErrors && (
            <div className="space-y-1">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-destructive">
                  {err}
                </p>
              ))}
            </div>
          )}

          {/* Topology preview */}
          {hasContent && !hasErrors && result.flatItems.length > 0 && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-md border border-border bg-background/50 overflow-hidden">
                <ProfileTrunk items={result.flatItems} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onImport(name.trim(), result.profile)}
            disabled={!canImport || saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
