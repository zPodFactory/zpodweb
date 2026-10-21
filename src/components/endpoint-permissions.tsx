import { useState } from "react"
import { useApi } from "@/hooks/use-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { PickItemDialog } from "@/components/pick-item-dialog"
import { IconTooltip } from "@/components/icon-tooltip"
import { toast } from "sonner"
import { Plus, ShieldCheck, User as UserIcon, Users as UsersIcon, X } from "lucide-react"
import { apiErrorDetail } from "@/lib/utils"
import { EndpointPermission } from "@/types"
import type { EndpointFull, EndpointPermissionView, PermissionGroup, User } from "@/types"

type Kind = "user" | "group"

interface EndpointPermissionsProps {
  endpoint: EndpointFull
  permissions: EndpointPermissionView[]
  allUsers: User[]
  allGroups: PermissionGroup[]
  onChanged: () => void
}

/** Superadmin-only editor for who may deploy zPods on an endpoint */
export function EndpointPermissions({
  endpoint,
  permissions,
  allUsers,
  allGroups,
  onChanged,
}: EndpointPermissionsProps) {
  const {
    addEndpointPermissionUser,
    removeEndpointPermissionUser,
    addEndpointPermissionGroup,
    removeEndpointPermissionGroup,
  } = useApi()
  const permission = EndpointPermission.USER
  const entry = permissions.find((p) => p.permission === permission)
  const users = entry?.users ?? []
  const groups = entry?.permission_groups ?? []

  const [addKind, setAddKind] = useState<Kind | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{ kind: Kind; id: number; name: string } | null>(null)
  const [removing, setRemoving] = useState(false)

  const candidates =
    addKind === "user"
      ? allUsers
          .filter((u) => !users.some((x) => x.id === u.id))
          .map((u) => ({ id: u.id, label: `${u.username} (${u.email})` }))
      : allGroups
          .filter((g) => !groups.some((x) => x.id === g.id))
          .map((g) => ({ id: g.id, label: g.name }))
  candidates.sort((a, b) => a.label.localeCompare(b.label))

  const handleAdd = async (id: number) => {
    try {
      if (addKind === "user") {
        await addEndpointPermissionUser(endpoint.id, permission, { user_id: id })
        const name = allUsers.find((u) => u.id === id)?.username ?? `#${id}`
        toast.success(`User "${name}" granted access to "${endpoint.name}"`)
      } else {
        await addEndpointPermissionGroup(endpoint.id, permission, { group_id: id })
        const name = allGroups.find((g) => g.id === id)?.name ?? `#${id}`
        toast.success(`Group "${name}" granted access to "${endpoint.name}"`)
      }
      onChanged()
    } catch (err) {
      toast.error("Failed to grant access", { description: apiErrorDetail(err) })
      throw err
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      if (removeTarget.kind === "user") {
        await removeEndpointPermissionUser(endpoint.id, permission, { user_id: removeTarget.id })
      } else {
        await removeEndpointPermissionGroup(endpoint.id, permission, { group_id: removeTarget.id })
      }
      toast.success(`Access revoked for "${removeTarget.name}"`)
      setRemoveTarget(null)
      onChanged()
    } catch (err) {
      toast.error("Failed to revoke access", { description: apiErrorDetail(err) })
    } finally {
      setRemoving(false)
    }
  }

  const removeButton = (kind: Kind, id: number, name: string) => (
    <IconTooltip label={`Revoke ${kind}`}>
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4 ml-0.5 text-muted-foreground hover:text-destructive"
        onClick={() => setRemoveTarget({ kind, id, name })}
      >
        <X className="h-3 w-3" />
      </Button>
    </IconTooltip>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">Access</span>
          <span className="text-xs text-muted-foreground">
            Users and groups who can see and use this endpoint
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => setAddKind("user")}>
            <Plus className="h-3 w-3" />
            Add user
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => setAddKind("group")}>
            <Plus className="h-3 w-3" />
            Add group
          </Button>
        </div>
      </div>
      <div className="ml-5 flex flex-wrap gap-1.5">
        {users.length === 0 && groups.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Superadmins only</span>
        ) : (
          <>
            {users.map((u) => (
              <Badge key={`u-${u.id}`} variant="secondary" className="gap-1 pr-1 font-normal">
                <UserIcon className="h-3 w-3" />
                {u.username}
                {removeButton("user", u.id, u.username)}
              </Badge>
            ))}
            {groups.map((g) => (
              <Badge key={`g-${g.id}`} variant="secondary" className="gap-1 pr-1 font-normal">
                <UsersIcon className="h-3 w-3" />
                {g.name}
                {removeButton("group", g.id, g.name)}
              </Badge>
            ))}
          </>
        )}
      </div>

      <PickItemDialog
        open={addKind != null}
        onOpenChange={(o) => !o && setAddKind(null)}
        title={`Grant access to ${endpoint.name}`}
        description={`Allow a ${addKind === "group" ? "permission group" : "user"} to see and use this endpoint.`}
        label={addKind === "group" ? "Group" : "User"}
        itemName={addKind ?? "user"}
        items={candidates}
        onConfirm={handleAdd}
        confirmText="Grant"
      />

      <ConfirmationDialog
        open={removeTarget != null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Revoke Access"
        description={
          <>
            Revoke access to <span className="font-semibold">{endpoint.name}</span> for{" "}
            {removeTarget?.kind}{" "}
            <span className="font-semibold">{removeTarget?.name}</span>? Existing zPods are not
            affected.
          </>
        }
        onConfirm={handleRemove}
        loading={removing}
        confirmText="Revoke"
        destructive
      />
    </div>
  )
}
