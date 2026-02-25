import { useEffect, useState } from "react"
import { useApi } from "@/hooks/use-api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Loader2, Cpu, Network } from "lucide-react"
import { ProfileTrunk } from "@/components/profile-trunk"
import { flattenProfileItems } from "@/lib/profile-utils"
import type {
  Profile,
  EndpointFull,
  Setting,
} from "@/types"

interface ZpodCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateComplete: () => void
}

function ProfileHoverContent({ profile }: { profile: Profile }) {
  const items = flattenProfileItems(profile.profile)
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{profile.name}</p>
      <Separator />
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-0.5 pr-2">Component</th>
              <th className="text-left py-0.5 pr-2">Host</th>
              <th className="text-right py-0.5 pr-2">vCPU</th>
              <th className="text-right py-0.5">vMem</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-0.5 pr-2">{item.component_uid}</td>
                <td className="py-0.5 pr-2">{item.hostname ?? "—"}</td>
                <td className="text-right py-0.5 pr-2">
                  {item.vcpu ?? "—"}
                </td>
                <td className="text-right py-0.5">
                  {item.vmem ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EndpointHoverContent({ endpoint }: { endpoint: EndpointFull }) {
  const { compute, network } = endpoint.endpoints
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{endpoint.name}</p>
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">Compute</span>
          <span className="text-[10px] text-muted-foreground">
            ({compute.driver})
          </span>
        </div>
        <div className="ml-4 space-y-0.5 text-xs">
          <Row label="Host" value={compute.hostname} />
          <Row label="Datacenter" value={compute.datacenter} />
          <Row label="Resource Pool" value={compute.resource_pool} />
          <Row label="Datastore" value={compute.storage_datastore} />
        </div>
      </div>
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Network className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">Network</span>
          <span className="text-[10px] text-muted-foreground">
            ({network.driver})
          </span>
        </div>
        <div className="ml-4 space-y-0.5 text-xs">
          <Row label="Host" value={network.hostname} />
          <Row label="Transport Zone" value={network.transportzone} />
          <Row label="Edge Cluster" value={network.edgecluster} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

export function ZpodCreateDialog({
  open,
  onOpenChange,
  onCreateComplete,
}: ZpodCreateDialogProps) {
  const { fetchProfiles, fetchEndpoints, fetchSettings, createZpod } = useApi()

  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [profileName, setProfileName] = useState("")
  const [endpointId, setEndpointId] = useState("")
  const [creating, setCreating] = useState(false)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [endpoints, setEndpoints] = useState<EndpointFull[]>([])
  const [defaultDomain, setDefaultDomain] = useState("")
  const [dataLoading, setDataLoading] = useState(false)

  const activeEndpoints = endpoints.filter((ep) => ep.status === "ACTIVE")

  // Load data when dialog opens
  useEffect(() => {
    if (!open) return
    setName("")
    setDomain("")
    setProfileName("")
    setEndpointId("")
    setDataLoading(true)

    Promise.all([fetchProfiles(), fetchEndpoints(), fetchSettings()])
      .then(([p, e, s]: [Profile[], EndpointFull[], Setting[]]) => {
        setProfiles([...p].sort((a, b) => a.name.localeCompare(b.name)))
        setEndpoints(e)
        const domainSetting = s.find(
          (setting) => setting.name === "zpodfactory_default_domain"
        )
        setDefaultDomain(domainSetting?.value ?? "")
        // Pre-select default profile if setting exists and profile matches
        const defaultProfileSetting = s.find(
          (setting) => setting.name === "ff_zpod_default_profile"
        )
        if (defaultProfileSetting?.value) {
          const match = p.find(
            (profile) => profile.name === defaultProfileSetting.value
          )
          if (match) setProfileName(match.name)
        }
        // Auto-select if exactly one active endpoint
        const active = e.filter((ep) => ep.status === "ACTIVE")
        if (active.length === 1) {
          setEndpointId(String(active[0].id))
        }
      })
      .catch(() => toast.error("Failed to load form data"))
      .finally(() => setDataLoading(false))
  }, [open, fetchProfiles, fetchEndpoints, fetchSettings])

  const domainPreview =
    name && defaultDomain ? `${name}.${domain || defaultDomain}` : ""

  const canSubmit =
    name.trim() !== "" && profileName !== "" && endpointId !== "" && !creating

  async function handleCreate() {
    if (!canSubmit) return
    setCreating(true)
    try {
      await createZpod({
        name: name.trim().toLowerCase(),
        endpoint_id: Number(endpointId),
        profile: profileName,
        ...(domain ? { domain } : {}),
      })
      toast.success(`zPod "${name}" creation started`)
      onOpenChange(false)
      onCreateComplete()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create zpod"
      // Try to extract API error detail
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } }
      if (axiosErr.response?.status === 409) {
        toast.error("Name conflict", {
          description: axiosErr.response.data?.detail ?? "A zpod with this name already exists",
        })
      } else if (axiosErr.response?.status === 406) {
        toast.error("Invalid input", {
          description: axiosErr.response.data?.detail ?? "Check name, endpoint, or profile",
        })
      } else {
        toast.error("Failed to create zpod", { description: msg })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create zPod</DialogTitle>
          <DialogDescription>
            Deploy a new zpod with the selected profile and endpoint.
          </DialogDescription>
        </DialogHeader>

        {dataLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="zpod-name">Name</Label>
              <Input
                id="zpod-name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="my-zpod"
                autoFocus
              />
            </div>

            {/* Domain */}
            <div className="space-y-2">
              <Label htmlFor="zpod-domain">Domain</Label>
              <Input
                id="zpod-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={defaultDomain || "example.com"}
              />
              {domainPreview && (
                <p className="text-xs text-muted-foreground">
                  {domainPreview}
                </p>
              )}
            </div>

            {/* Profile */}
            <div className="space-y-2">
              <Label>Profile</Label>
              <Select value={profileName} onValueChange={setProfileName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => {
                    const count = flattenProfileItems(p.profile).length
                    return (
                      <HoverCard key={p.id} openDelay={300} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <SelectItem value={p.name}>
                            {p.name} ({count} component
                            {count !== 1 && "s"})
                          </SelectItem>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          className="w-80"
                        >
                          <ProfileHoverContent profile={p} />
                        </HoverCardContent>
                      </HoverCard>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Profile topology preview */}
            {profileName && (() => {
              const selectedProfile = profiles.find((p) => p.name === profileName)
              if (!selectedProfile) return null
              const items = flattenProfileItems(selectedProfile.profile)
              if (items.length === 0) return null
              return <ProfileTrunk items={items} />
            })()}

            {/* Endpoint — only show if >1 active endpoint */}
            {activeEndpoints.length > 1 && (
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Select value={endpointId} onValueChange={setEndpointId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an endpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEndpoints.map((ep) => (
                      <HoverCard key={ep.id} openDelay={300} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <SelectItem value={String(ep.id)}>
                            {ep.name}
                          </SelectItem>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          className="w-80"
                        >
                          <EndpointHoverContent endpoint={ep} />
                        </HoverCardContent>
                      </HoverCard>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit || dataLoading}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
