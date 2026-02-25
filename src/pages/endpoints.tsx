import { useCallback, useEffect, useState } from "react"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Server, Cpu, Network } from "lucide-react"
import type { EndpointFull } from "@/types"
import { DetailRow } from "@/components/detail-row"

export function EndpointsPage() {
  const { fetchEndpoints } = useApi()
  const [endpoints, setEndpoints] = useState<EndpointFull[]>([])
  const [loading, setLoading] = useState(true)
  const { sorted } = useSort(endpoints, "name")

  const loadEndpoints = useCallback(() => {
    fetchEndpoints().then(setEndpoints).catch(() => {})
  }, [fetchEndpoints])

  useEffect(() => {
    fetchEndpoints()
      .then(setEndpoints)
      .catch(() => toast.error("Failed to fetch endpoints"))
      .finally(() => setLoading(false))
  }, [fetchEndpoints])

  usePolling(loadEndpoints)

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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Endpoints</h1>
        <Badge variant="outline">{endpoints.length} total</Badge>
      </div>

      {endpoints.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              No endpoints found
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((ep) => (
            <Card key={ep.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Server className="h-4 w-4" />
                    {ep.name}
                  </CardTitle>
                  <Badge
                    variant={
                      ep.status === "ACTIVE" ? "default" : "secondary"
                    }
                  >
                    {ep.status}
                  </Badge>
                </div>
                {ep.description && (
                  <p className="text-sm text-muted-foreground">
                    {ep.description}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">Compute</span>
                      <Badge variant="outline" className="text-xs">
                        {ep.endpoints.compute.driver}
                      </Badge>
                    </div>
                    <div className="ml-5 space-y-0">
                      <DetailRow label="Host" value={ep.endpoints.compute.hostname} />
                      <DetailRow label="Datacenter" value={ep.endpoints.compute.datacenter} />
                      <DetailRow label="Resource Pool" value={ep.endpoints.compute.resource_pool} />
                      <DetailRow label="Storage Policy" value={ep.endpoints.compute.storage_policy} />
                      <DetailRow label="Datastore" value={ep.endpoints.compute.storage_datastore} />
                      <DetailRow label="Content Library" value={ep.endpoints.compute.contentlibrary} />
                      <DetailRow label="VM Folder" value={ep.endpoints.compute.vmfolder} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">Network</span>
                      <Badge variant="outline" className="text-xs">
                        {ep.endpoints.network.driver}
                      </Badge>
                    </div>
                    <div className="ml-5 space-y-0">
                      <DetailRow label="Host" value={ep.endpoints.network.hostname} />
                      <DetailRow label="Networks" value={ep.endpoints.network.networks} />
                      <DetailRow label="Transport Zone" value={ep.endpoints.network.transportzone} />
                      <DetailRow label="Edge Cluster" value={ep.endpoints.network.edgecluster} />
                      <DetailRow label="T0" value={ep.endpoints.network.t0} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
