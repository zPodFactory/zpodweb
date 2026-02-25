import { useCallback, useEffect, useState } from "react"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { SortableHead } from "@/components/sortable-head"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { IconTooltip } from "@/components/icon-tooltip"
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { copyToClipboard } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth-store"
import type { Setting } from "@/types"

export function SettingsPage() {
  const { fetchSettings, createSetting, updateSetting, deleteSetting } = useApi()
  const { user } = useAuthStore()
  const isSuperadmin = user?.superadmin ?? false
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const { sorted, sort, toggleSort } = useSort(settings, "name")

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Setting | null>(null)
  const [formName, setFormName] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formValue, setFormValue] = useState("")
  const [saving, setSaving] = useState(false)

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Setting | null>(null)
  const [deleting, setDeleting] = useState(false)


  const loadSettings = useCallback(() => {
    fetchSettings().then(setSettings).catch(() => {})
  }, [fetchSettings])

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(() => toast.error("Failed to fetch settings"))
      .finally(() => setLoading(false))
  }, [fetchSettings])

  usePolling(loadSettings)

  const handleCreate = () => {
    setEditTarget(null)
    setFormName("")
    setFormDesc("")
    setFormValue("")
    setEditorOpen(true)
  }

  const handleEdit = (setting: Setting) => {
    setEditTarget(setting)
    setFormName(setting.name)
    setFormDesc(setting.description)
    setFormValue(setting.value)
    setEditorOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editTarget) {
        await updateSetting(editTarget.id, {
          description: formDesc,
          value: formValue,
        })
        toast.success(`Setting "${editTarget.name}" updated`)
      } else {
        await createSetting({
          name: formName.trim(),
          description: formDesc.trim(),
          value: formValue.trim(),
        })
        toast.success(`Setting "${formName.trim()}" created`)
      }
      setEditorOpen(false)
      loadSettings()
    } catch {
      toast.error(
        editTarget
          ? `Failed to update setting "${editTarget.name}"`
          : `Failed to create setting "${formName.trim()}"`
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSetting(deleteTarget.id)
      toast.success(`Setting "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      loadSettings()
    } catch {
      toast.error(`Failed to delete setting "${deleteTarget.name}"`)
    } finally {
      setDeleting(false)
    }
  }

  const isValid = editTarget
    ? formValue.trim().length > 0
    : formName.trim().length > 0 && formDesc.trim().length > 0 && formValue.trim().length > 0

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <Badge variant="outline">{settings.length} total</Badge>
        </div>
        {isSuperadmin && (
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add Setting
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {settings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No settings found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                  <SortableHead label="Description" sortKey="description" sort={sort} onToggle={toggleSort} className="hidden md:table-cell" />
                  <SortableHead label="Value" sortKey="value" sort={sort} onToggle={toggleSort} />
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((setting) => {
                  const isLicense = setting.name.toLowerCase().includes("license")
                  return (
                  <TableRow key={setting.id}>
                    <TableCell className="font-mono">
                      {setting.name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {setting.description}
                    </TableCell>
                    <TableCell className="font-mono max-w-[300px] break-all">
                      {isLicense ? "********" : setting.value}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <IconTooltip label="Copy value">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={async () => {
                              const ok = await copyToClipboard(setting.value)
                              if (ok) toast.success("Copied to clipboard")
                              else toast.error("Failed to copy")
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </IconTooltip>
                        {isSuperadmin && (
                          <>
                            <IconTooltip label="Edit">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEdit(setting)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </IconTooltip>
                            <IconTooltip label="Delete">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(setting)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </IconTooltip>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Setting" : "Add Setting"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Update the value or description for "${editTarget.name}".`
                : "Create a new API setting."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                className="text-xs font-mono"
                value={formName}
                disabled={editTarget != null}
                placeholder="e.g. my_setting_name"
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                className="text-xs"
                value={formDesc}
                placeholder="What this setting controls"
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Value</Label>
              <Input
                className="text-xs font-mono"
                value={formValue}
                placeholder="Setting value"
                onChange={(e) => setFormValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteTarget != null}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Setting"
        description={<>Are you sure you want to delete{" "}<span className="font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.</>}
        onConfirm={handleDelete}
        loading={deleting}
        confirmText="Delete"
      />
    </div>
  )
}
