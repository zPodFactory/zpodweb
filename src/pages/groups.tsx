import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { PickItemDialog } from "@/components/pick-item-dialog"
import { IconTooltip } from "@/components/icon-tooltip"
import { toast } from "sonner"
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
  UserPlus,
  Users as UsersIcon,
  X,
} from "lucide-react"
import { apiErrorDetail, cn } from "@/lib/utils"
import type { PermissionGroup, User } from "@/types"

export function GroupsPage() {
  const {
    fetchPermissionGroups,
    fetchUsers,
    createPermissionGroup,
    renamePermissionGroup,
    deletePermissionGroup,
    addPermissionGroupUser,
    removePermissionGroupUser,
  } = useApi()
  const isSuperadmin = useAuthStore((s) => s.user?.superadmin ?? false)

  const [groups, setGroups] = useState<PermissionGroup[]>([])
  // ?group=<id>, from a group badge on the Users page: scroll to that group and flash it
  const [searchParams, setSearchParams] = useSearchParams()
  const focusGroup = searchParams.get("group")
  const [flashGroup, setFlashGroup] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const { sorted } = useSort(groups, "name")

  // Create / rename dialog
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PermissionGroup | null>(null)
  const [formName, setFormName] = useState("")
  const [saving, setSaving] = useState(false)

  const [addMemberTarget, setAddMemberTarget] = useState<PermissionGroup | null>(null)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ group: PermissionGroup; user: User } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PermissionGroup | null>(null)
  const [mutating, setMutating] = useState(false)

  const loadData = useCallback(() => {
    fetchPermissionGroups().then(setGroups).catch(() => {})
    // Only superadmins can list every user, and only they need to
    if (isSuperadmin) fetchUsers().then(setUsers).catch(() => {})
  }, [fetchPermissionGroups, fetchUsers, isSuperadmin])

  useEffect(() => {
    Promise.all([
      fetchPermissionGroups().then(setGroups),
      isSuperadmin ? fetchUsers().then(setUsers).catch(() => setUsers([])) : null,
    ])
      .catch(() => toast.error("Failed to fetch permission groups"))
      .finally(() => setLoading(false))
  }, [fetchPermissionGroups, fetchUsers, isSuperadmin])

  usePolling(loadData)

  const handleCreate = () => {
    setEditTarget(null)
    setFormName("")
    setEditorOpen(true)
  }

  const handleRename = (group: PermissionGroup) => {
    setEditTarget(group)
    setFormName(group.name)
    setEditorOpen(true)
  }

  const handleSave = async () => {
    const name = formName.trim()
    setSaving(true)
    try {
      if (editTarget) {
        await renamePermissionGroup(editTarget.id, { name })
        toast.success(`Group "${editTarget.name}" renamed to "${name.toLowerCase()}"`)
      } else {
        const created = await createPermissionGroup({ name })
        toast.success(`Group "${created.name}" created`)
      }
      setEditorOpen(false)
      loadData()
    } catch (err) {
      toast.error(editTarget ? "Failed to rename group" : `Failed to create group "${name}"`, {
        description: apiErrorDetail(err),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAddMember = async (userId: number) => {
    if (!addMemberTarget) return
    try {
      await addPermissionGroupUser(addMemberTarget.id, userId)
      const name = users.find((u) => u.id === userId)?.username ?? `#${userId}`
      toast.success(`User "${name}" added to "${addMemberTarget.name}"`)
      loadData()
    } catch (err) {
      toast.error("Failed to add user to group", { description: apiErrorDetail(err) })
      throw err
    }
  }

  const handleRemoveMember = async () => {
    if (!removeMemberTarget) return
    const { group, user } = removeMemberTarget
    setMutating(true)
    try {
      await removePermissionGroupUser(group.id, user.id)
      toast.success(`User "${user.username}" removed from "${group.name}"`)
      setRemoveMemberTarget(null)
      loadData()
    } catch (err) {
      toast.error("Failed to remove user from group", { description: apiErrorDetail(err) })
    } finally {
      setMutating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setMutating(true)
    try {
      await deletePermissionGroup(deleteTarget.id)
      toast.success(`Group "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      loadData()
    } catch (err) {
      toast.error(`Failed to delete group "${deleteTarget.name}"`, {
        description: apiErrorDetail(err),
      })
    } finally {
      setMutating(false)
    }
  }

  const trimmedName = formName.trim()
  const isValid = trimmedName.length > 0 && trimmedName.toLowerCase() !== editTarget?.name

  const memberCandidates = addMemberTarget
    ? users
        .filter((u) => !addMemberTarget.users.some((m) => m.id === u.id))
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((u) => ({ id: u.id, label: `${u.username} (${u.email})` }))
    : []

  useEffect(() => {
    if (loading || !focusGroup) return
    document.getElementById(`group-${focusGroup}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    setFlashGroup(focusGroup)
    // Drop the param so a reload or the polling refresh doesn't flash it again
    setSearchParams({}, { replace: true })
  }, [loading, focusGroup, setSearchParams])

  // The outline fades after a few seconds, or at the first click anywhere
  useEffect(() => {
    if (!flashGroup) return
    const clear = () => setFlashGroup(null)
    const timer = setTimeout(clear, 3000)
    document.addEventListener("pointerdown", clear)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("pointerdown", clear)
    }
  }, [flashGroup])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
          <Badge variant="outline">{groups.length} total</Badge>
        </div>
        {isSuperadmin && (
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add Group
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">No permission groups found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((group) => (
            <Card
              key={group.id}
              id={`group-${group.id}`}
              className={cn("transition-shadow duration-500", String(group.id) === flashGroup && "ring-2 ring-[#89b4fa]/70")}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UsersIcon className="h-4 w-4" />
                    <span className="font-mono">{group.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {group.users.length} member{group.users.length !== 1 && "s"}
                    </span>
                  </CardTitle>
                  {isSuperadmin && (
                    <div className="flex items-center gap-1">
                      <IconTooltip label="Add member">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setAddMemberTarget(group)}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </IconTooltip>
                      <IconTooltip label="Rename">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRename(group)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </IconTooltip>
                      <IconTooltip label="Delete group">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(group)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </IconTooltip>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {group.users.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No members</span>
                  ) : (
                    [...group.users]
                      .sort((a, b) => a.username.localeCompare(b.username))
                      .map((u) => (
                        <Badge key={u.id} variant="secondary" className="gap-1 pr-1 font-normal">
                          <UserIcon className="h-3 w-3" />
                          {u.username}
                          {isSuperadmin && (
                            <IconTooltip label="Remove from group">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 ml-0.5 text-muted-foreground hover:text-destructive"
                                onClick={() => setRemoveMemberTarget({ group, user: u })}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </IconTooltip>
                          )}
                        </Badge>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Rename dialog */}
      <Dialog open={editorOpen} onOpenChange={(o) => !saving && setEditorOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Rename Group" : "Add Group"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Choose a new name for "${editTarget.name}".`
                : "Groups let you grant zPod and endpoint permissions to several users at once."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Name</Label>
            <Input
              className="text-xs font-mono"
              value={formName}
              placeholder="e.g. team-lab"
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && isValid && !saving && handleSave()}
            />
            <p className="text-[11px] text-muted-foreground">Names are stored in lowercase.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PickItemDialog
        open={addMemberTarget != null}
        onOpenChange={(o) => !o && setAddMemberTarget(null)}
        title={`Add member to ${addMemberTarget?.name ?? ""}`}
        description="Members inherit every permission granted to the group."
        label="User"
        itemName="user"
        items={memberCandidates}
        onConfirm={handleAddMember}
      />

      <ConfirmationDialog
        open={removeMemberTarget != null}
        onOpenChange={(o) => !o && setRemoveMemberTarget(null)}
        title="Remove Member"
        description={
          <>
            Remove <span className="font-semibold">{removeMemberTarget?.user.username}</span> from{" "}
            <span className="font-semibold">{removeMemberTarget?.group.name}</span>? They lose every
            permission granted through this group.
          </>
        }
        onConfirm={handleRemoveMember}
        loading={mutating}
        confirmText="Remove"
        destructive
      />

      <ConfirmationDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Group"
        description={
          <>
            Are you sure you want to delete{" "}
            <span className="font-semibold">{deleteTarget?.name}</span>? Its members lose every
            permission granted through it. This action cannot be undone.
          </>
        }
        onConfirm={handleDelete}
        loading={mutating}
        confirmText="Delete"
        destructive
        icon={<Trash2 className="h-4 w-4" />}
      />
    </div>
  )
}
