import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { toast } from "sonner"
import { IconTooltip } from "@/components/icon-tooltip"
import { ClipboardCopy, Layers, Pencil, Plus, Trash2, Upload } from "lucide-react"
import { ProfileEditorDialog } from "@/components/profile-editor-dialog"
import { ProfileImportDialog } from "@/components/profile-import-dialog"
import { useAuthStore } from "@/stores/auth-store"
import { ProfileTrunk } from "@/components/profile-trunk"
import { copyToClipboard } from "@/lib/utils"
import { flattenProfileItems } from "@/lib/profile-utils"
import type { ComponentFull, Profile, ProfileItemCreate } from "@/types"


export function ProfilesPage() {
  const {
    fetchProfiles,
    fetchComponents,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useApi()
  const { user } = useAuthStore()
  const isSuperadmin = user?.superadmin ?? false
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [components, setComponents] = useState<ComponentFull[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const { sorted } = useSort(profiles, "name")

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Deep-link: auto-expand profile from ?profile=Name query param
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightName = searchParams.get("profile")
  const highlightApplied = useRef(false)

  const loadProfiles = useCallback(() => {
    fetchProfiles().then(setProfiles).catch(() => {})
  }, [fetchProfiles])

  useEffect(() => {
    Promise.all([fetchProfiles(), fetchComponents()])
      .then(([p, c]) => {
        setProfiles(p)
        setComponents(c)
      })
      .catch(() => toast.error("Failed to fetch data"))
      .finally(() => setLoading(false))
  }, [fetchProfiles, fetchComponents])

  usePolling(loadProfiles)

  // Auto-expand the profile specified in the URL query param
  useEffect(() => {
    if (!highlightName || highlightApplied.current || profiles.length === 0) return
    const match = profiles.find((p) => p.name === highlightName)
    if (match) {
      setExpanded((prev) => new Set(prev).add(match.id))
      highlightApplied.current = true
      // Clean up the query param
      setSearchParams((prev) => {
        prev.delete("profile")
        return prev
      }, { replace: true })
      // Scroll to the profile card after render
      setTimeout(() => {
        document.getElementById(`profile-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    }
  }, [highlightName, profiles, setSearchParams])

  const handleCreate = () => {
    setEditingProfile(null)
    setEditorOpen(true)
  }

  const handleEdit = (profile: Profile) => {
    setEditingProfile(profile)
    setEditorOpen(true)
  }

  const handleSave = async (
    name: string,
    profileData: (ProfileItemCreate | ProfileItemCreate[])[]
  ) => {
    setSaving(true)
    try {
      if (editingProfile) {
        const payload: { name?: string; profile: typeof profileData } = { profile: profileData }
        // Only send name if it changed to avoid unique constraint conflict
        if (name !== editingProfile.name) payload.name = name
        await updateProfile(editingProfile.id, payload)
        toast.success(`Profile "${name}" updated`)
      } else {
        await createProfile({ name, profile: profileData })
        toast.success(`Profile "${name}" created`)
      }
      setEditorOpen(false)
      loadProfiles()
    } catch {
      toast.error(
        editingProfile
          ? `Failed to update profile "${name}"`
          : `Failed to create profile "${name}"`
      )
    } finally {
      setSaving(false)
    }
  }

  const handleCopyJson = async (profile: Profile) => {
    const exportData = {
      name: profile.name,
      profile: profile.profile.map((step) => {
        if (Array.isArray(step)) {
          return step.map(({ component_uid, hostname, vcpu, vmem, vnics, vdisks }) => {
            const item: Record<string, unknown> = { component_uid }
            if (hostname != null) item.hostname = hostname
            if (vcpu != null) item.vcpu = vcpu
            if (vmem != null) item.vmem = vmem
            if (vnics != null) item.vnics = vnics
            if (vdisks != null) item.vdisks = vdisks
            return item
          })
        }
        const { component_uid, hostname, vcpu, vmem, vnics, vdisks } = step
        const item: Record<string, unknown> = { component_uid }
        if (hostname != null) item.hostname = hostname
        if (vcpu != null) item.vcpu = vcpu
        if (vmem != null) item.vmem = vmem
        if (vnics != null) item.vnics = vnics
        if (vdisks != null) item.vdisks = vdisks
        return item
      }),
    }
    const ok = await copyToClipboard(JSON.stringify(exportData, null, 2))
    if (ok) toast.success(`Copied "${profile.name}" JSON to clipboard`)
    else toast.error("Failed to copy to clipboard")
  }

  const handleImport = async (
    name: string,
    profileData: (ProfileItemCreate | ProfileItemCreate[])[]
  ) => {
    setImporting(true)
    try {
      await createProfile({ name, profile: profileData })
      toast.success(`Profile "${name}" imported`)
      setImportOpen(false)
      loadProfiles()
    } catch {
      toast.error(`Failed to import profile "${name}"`)
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteProfile(deleteTarget.id)
      toast.success(`Profile "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      loadProfiles()
    } catch {
      toast.error(`Failed to delete profile "${deleteTarget.name}"`)
    } finally {
      setDeleting(false)
    }
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Profiles</h1>
          <Badge variant="outline">{profiles.length} total</Badge>
        </div>
        {isSuperadmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Import Profile
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleCreate}>
              <Plus className="h-3.5 w-3.5" />
              Create Profile
            </Button>
          </div>
        )}
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              No profiles found
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((profile) => {
            const items = flattenProfileItems(profile.profile)
            const isExpanded = expanded.has(profile.id)
            return (
              <Card key={profile.id} id={`profile-${profile.id}`}>
                <CardHeader
                  className="cursor-pointer py-3"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (isExpanded) next.delete(profile.id)
                      else next.add(profile.id)
                      return next
                    })
                  }
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Layers className="h-4 w-4" />
                      {profile.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30">
                        {items.length} component{items.length !== 1 && "s"}
                      </Badge>
                      <IconTooltip label="Copy JSON">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyJson(profile)
                          }}
                        >
                          <ClipboardCopy className="h-3 w-3" />
                        </Button>
                      </IconTooltip>
                      {isSuperadmin && (
                        <>
                          <IconTooltip label="Edit profile">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(profile)
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="Delete profile">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(profile)
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <ProfileTrunk items={items} />
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Profile editor dialog */}
      <ProfileEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        profile={editingProfile}
        components={components}
        saving={saving}
        onSave={handleSave}
      />

      {/* Profile import dialog */}
      <ProfileImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        components={components}
        onImport={handleImport}
        saving={importing}
      />

      <ConfirmationDialog
        open={deleteTarget != null}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Profile"
        description={<>Are you sure you want to delete{" "}<span className="font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.</>}
        onConfirm={handleDelete}
        loading={deleting}
        confirmText="Delete"
      />
    </div>
  )
}
