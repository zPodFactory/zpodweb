import { useCallback, useEffect, useState } from "react"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
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
import { IconTooltip } from "@/components/icon-tooltip"
import { toast } from "sonner"
import { Link } from "react-router"
import {
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
} from "lucide-react"
import { apiErrorDetail, cn, copyToClipboard, formatDateTime } from "@/lib/utils"
import { statusClasses } from "@/lib/status-colors"
import type { PermissionGroup, User, UserWithToken } from "@/types"

// The API refuses to delete the initial superuser
const PROTECTED_USER_ID = 1

const textareaClasses =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

async function copyValue(value: string) {
  if (await copyToClipboard(value)) toast.success("Copied to clipboard")
  else toast.error("Failed to copy")
}

export function UsersPage() {
  const {
    fetchUsers,
    fetchPermissionGroups,
    createUser,
    updateUser,
    deleteUser,
    enableUser,
    disableUser,
    resetUserApiToken,
  } = useApi()
  const currentUser = useAuthStore((s) => s.user)
  const setCurrentUser = useAuthStore((s) => s.setUser)
  const isSuperadmin = currentUser?.superadmin ?? false

  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<PermissionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showDisabled, setShowDisabled] = useState(false)
  const { sorted, sort, toggleSort } = useSort(users, "username")

  // Create / edit dialog
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [formUsername, setFormUsername] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formSshKey, setFormSshKey] = useState("")
  const [formSuperadmin, setFormSuperadmin] = useState(false)
  const [saving, setSaving] = useState(false)

  // Token reveal after create / reset
  const [tokenReveal, setTokenReveal] = useState<{ user: UserWithToken; reason: string } | null>(null)

  const [statusTarget, setStatusTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [mutating, setMutating] = useState(false)

  const loadData = useCallback(() => {
    fetchUsers(showDisabled).then(setUsers).catch(() => {})
    fetchPermissionGroups().then(setGroups).catch(() => {})
  }, [fetchUsers, fetchPermissionGroups, showDisabled])

  useEffect(() => {
    Promise.all([
      fetchUsers(showDisabled).then(setUsers),
      fetchPermissionGroups().then(setGroups).catch(() => setGroups([])),
    ])
      .catch(() => toast.error("Failed to fetch users"))
      .finally(() => setLoading(false))
  }, [fetchUsers, fetchPermissionGroups, showDisabled])

  usePolling(loadData)

  const groupsOf = (userId: number) =>
    groups.filter((g) => g.users.some((u) => u.id === userId))

  const handleCreate = () => {
    setEditTarget(null)
    setFormUsername("")
    setFormEmail("")
    setFormDesc("")
    setFormSshKey("")
    setFormSuperadmin(false)
    setEditorOpen(true)
  }

  const handleEdit = (user: User) => {
    setEditTarget(user)
    setFormUsername(user.username)
    setFormEmail(user.email)
    setFormDesc(user.description ?? "")
    setFormSshKey("")
    setFormSuperadmin(user.superadmin)
    setEditorOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editTarget) {
        const updated = await updateUser(editTarget.id, {
          email: formEmail.trim(),
          description: formDesc.trim(),
          // The API never returns the current key, so only send a replacement
          ...(formSshKey.trim() && { ssh_key: formSshKey.trim() }),
          ...(isSuperadmin && editTarget.id !== currentUser?.id && { superadmin: formSuperadmin }),
        })
        if (updated.id === currentUser?.id) setCurrentUser(updated)
        toast.success(`User "${editTarget.username}" updated`)
      } else {
        const created = await createUser({
          username: formUsername.trim(),
          email: formEmail.trim(),
          description: formDesc.trim(),
          ssh_key: formSshKey.trim(),
          superadmin: formSuperadmin,
        })
        toast.success(`User "${created.username}" created`)
        setTokenReveal({ user: created, reason: "created" })
      }
      setEditorOpen(false)
      loadData()
    } catch (err) {
      toast.error(
        editTarget
          ? `Failed to update user "${editTarget.username}"`
          : `Failed to create user "${formUsername.trim()}"`,
        { description: apiErrorDetail(err) }
      )
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!statusTarget) return
    const enabling = statusTarget.status !== "ENABLED"
    setMutating(true)
    try {
      await (enabling ? enableUser : disableUser)(statusTarget.id)
      toast.success(`User "${statusTarget.username}" ${enabling ? "enabled" : "disabled"}`)
      setStatusTarget(null)
      loadData()
    } catch (err) {
      toast.error(`Failed to ${enabling ? "enable" : "disable"} user`, {
        description: apiErrorDetail(err),
      })
    } finally {
      setMutating(false)
    }
  }

  const handleResetToken = async () => {
    if (!resetTarget) return
    setMutating(true)
    try {
      const updated = await resetUserApiToken(resetTarget.id)
      setResetTarget(null)
      setTokenReveal({ user: updated, reason: "reset" })
      loadData()
    } catch (err) {
      toast.error("Failed to reset API token", { description: apiErrorDetail(err) })
    } finally {
      setMutating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setMutating(true)
    try {
      await deleteUser(deleteTarget.id)
      toast.success(`User "${deleteTarget.username}" deleted`)
      setDeleteTarget(null)
      loadData()
    } catch (err) {
      toast.error(`Failed to delete user "${deleteTarget.username}"`, {
        description: apiErrorDetail(err),
      })
    } finally {
      setMutating(false)
    }
  }

  const isValid = formEmail.trim().length > 0 && (editTarget != null || formUsername.trim().length > 0)

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
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <Badge variant="outline">{users.length} total</Badge>
        </div>
        {isSuperadmin && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={showDisabled} onCheckedChange={setShowDisabled} />
              Show disabled
            </label>
            <Button size="sm" className="gap-1.5" onClick={handleCreate}>
              <Plus className="h-3.5 w-3.5" />
              Add User
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users found</p>
          ) : (
            // Tighter rows than the default p-4: a user is one line, two with a description
            <Table className="[&_td]:py-2.5">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Username" sortKey="username" sort={sort} onToggle={toggleSort} />
                  <SortableHead label="Email" sortKey="email" sort={sort} onToggle={toggleSort} className="hidden md:table-cell" />
                  <TableHead className="hidden lg:table-cell">Groups</TableHead>
                  <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                  <SortableHead label="Last connection" sortKey="last_connection_date" sort={sort} onToggle={toggleSort} className="hidden xl:table-cell" />
                  <TableHead className="w-px whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((user) => {
                  const isSelf = user.id === currentUser?.id
                  const userGroups = groupsOf(user.id)
                  return (
                    // Your own row: a blue edge and a light tint instead of a "You" label
                    <TableRow
                      key={user.id}
                      className={cn(isSelf && "bg-[#89b4fa]/[0.06] shadow-[inset_3px_0_0_#89b4fa] hover:bg-[#89b4fa]/10")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {/* Shield for superadmins; the empty slot keeps every name aligned */}
                          {user.superadmin ? (
                            <IconTooltip label="Superadmin: full access to the factory">
                              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" aria-label="Superadmin" />
                            </IconTooltip>
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <span className="font-mono">{user.username}</span>
                          {isSelf && <span className="sr-only">(you)</span>}
                        </div>
                        {user.description && (
                          <p className="ml-6 text-xs text-muted-foreground mt-0.5">{user.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {userGroups.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            userGroups.map((g) => (
                              <Link key={g.id} to={`/groups?group=${g.id}`}>
                                <Badge variant="secondary" className="gap-1 font-normal hover:bg-secondary/60">
                                  <UsersIcon className="h-3 w-3" />
                                  {g.name}
                                </Badge>
                              </Link>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClasses(user.status)}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {user.last_connection_date ? formatDateTime(user.last_connection_date) : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {user.api_token && (
                            <IconTooltip label="Copy API token">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => copyValue(user.api_token!)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </IconTooltip>
                          )}
                          {(isSuperadmin || isSelf) && (
                            <IconTooltip label="Edit">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEdit(user)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </IconTooltip>
                          )}
                          {/* Not on oneself: resetting or disabling would lock out the current session */}
                          {isSuperadmin && !isSelf && (
                            <>
                              <IconTooltip label="Reset API token">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setResetTarget(user)}
                                >
                                  <KeyRound className="h-3 w-3" />
                                </Button>
                              </IconTooltip>
                              <IconTooltip label={user.status === "ENABLED" ? "Disable" : "Enable"}>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setStatusTarget(user)}
                                >
                                  {user.status === "ENABLED" ? (
                                    <Ban className="h-3 w-3" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                  )}
                                </Button>
                              </IconTooltip>
                              {user.id !== PROTECTED_USER_ID && (
                                <IconTooltip label="Delete">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteTarget(user)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </IconTooltip>
                              )}
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
      <Dialog open={editorOpen} onOpenChange={(o) => !saving && setEditorOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Update the profile of "${editTarget.username}".`
                : "Create a new user. An API token is generated automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input
                className="text-xs font-mono"
                value={formUsername}
                disabled={editTarget != null}
                placeholder="e.g. jdoe"
                onChange={(e) => setFormUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                className="text-xs"
                type="email"
                value={formEmail}
                placeholder="jdoe@example.com"
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                className="text-xs"
                value={formDesc}
                placeholder="Optional"
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SSH public key</Label>
              <textarea
                className={textareaClasses}
                value={formSshKey}
                placeholder={editTarget ? "Leave empty to keep the current key" : "ssh-ed25519 AAAA… (optional)"}
                onChange={(e) => setFormSshKey(e.target.value)}
              />
            </div>
            {isSuperadmin && (
              <label className="flex items-center justify-between gap-2 pt-1">
                <span className="space-y-0.5">
                  <span className="block text-xs font-medium">Superadmin</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {editTarget?.id === currentUser?.id
                      ? "You cannot change your own superadmin status"
                      : "Full access to every resource of this zPodFactory"}
                  </span>
                </span>
                <Switch
                  checked={formSuperadmin}
                  disabled={editTarget?.id === currentUser?.id}
                  onCheckedChange={setFormSuperadmin}
                />
              </label>
            )}
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

      {/* API token reveal */}
      <Dialog open={tokenReveal != null} onOpenChange={(o) => !o && setTokenReveal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {tokenReveal?.reason === "created" ? "User created" : "API token reset"}
            </DialogTitle>
            <DialogDescription>
              API token for <span className="font-semibold">{tokenReveal?.user.username}</span>.
              Share it securely: it grants full access to this account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Input readOnly className="text-xs font-mono" value={tokenReveal?.user.api_token ?? ""} />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => tokenReveal && copyValue(tokenReveal.user.api_token)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTokenReveal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={statusTarget != null}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        title={statusTarget?.status === "ENABLED" ? "Disable User" : "Enable User"}
        description={
          statusTarget?.status === "ENABLED" ? (
            <>
              Disable <span className="font-semibold">{statusTarget?.username}</span>? Their API
              token will stop working until the account is enabled again.
            </>
          ) : (
            <>
              Enable <span className="font-semibold">{statusTarget?.username}</span>?
            </>
          )
        }
        onConfirm={handleToggleStatus}
        loading={mutating}
        confirmText={statusTarget?.status === "ENABLED" ? "Disable" : "Enable"}
        destructive={statusTarget?.status === "ENABLED"}
      />

      <ConfirmationDialog
        open={resetTarget != null}
        onOpenChange={(o) => !o && setResetTarget(null)}
        title="Reset API Token"
        description={
          <>
            Generate a new API token for{" "}
            <span className="font-semibold">{resetTarget?.username}</span>? The current token
            stops working immediately.
          </>
        }
        onConfirm={handleResetToken}
        loading={mutating}
        confirmText="Reset"
        destructive
        icon={<KeyRound className="h-4 w-4" />}
      />

      <ConfirmationDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete User"
        description={
          <>
            Are you sure you want to delete{" "}
            <span className="font-semibold">{deleteTarget?.username}</span>? zPods they own are
            reassigned to the initial superuser. This action cannot be undone.
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
