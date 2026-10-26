import { useCallback } from "react"
import axios, { type AxiosInstance } from "axios"
import { useTargetStore } from "@/stores/target-store"
import { useAuthStore } from "@/stores/auth-store"
import type {
  User,
  UserWithToken,
  UserCreate,
  UserUpdate,
  PermissionGroupCreate,
  EndpointPermission,
  EndpointPermissionView,
  Zpod,
  ZpodCreate,
  ZpodDnsEntry,
  ZpodDnsCreate,
  ZpodPermission,
  ZpodPermissionMineView,
  ZpodPermissionUserAddRemove,
  ZpodPermissionGroupAddRemove,
  ZpodNetworkView,
  ZpodNetworkCreate,
  ZpodNetworkRoutingView,
  ZpodNetworkRoutingRunView,
  ZpodDiskView,
  ZpodDiskRunView,
  ZpodStorageView,
  ZpodStorageOperation,
  ZpodStorageFolderView,
  ZpodNfsExportView,
  ZpodNfsStatus,
  ZpodNfsCreate,
  PermissionGroup,
  ComponentFull,
  Library,
  Profile,
  ProfileCreate,
  ProfileUpdate,
  ProfileItemCreate,
  Setting,
  SettingCreate,
  SettingUpdate,
  EndpointFull,
  EndpointCreate,
  EndpointPasswordUpdate,
} from "@/types"

/** zpodapi's disk routes take the bare name: "sdc", not "/dev/sdc". */
function diskName(device: string): string {
  return device.replace(/^\/dev\//, "")
}

function useApiClient() {
  const { targets, activeTargetId } = useTargetStore()

  const getClient = useCallback((): AxiosInstance => {
    const target = targets.find((t) => t.id === activeTargetId)
    if (!target) throw new Error("No active target")

    const instance = axios.create({
      baseURL: "/api",
      headers: {
        access_token: target.token,
        "X-Target-Url": target.url,
      },
    })

    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        // A 403 on a zPod network or storage route is a refused operation (zboxapi's
        // reserved VLANs, superadmin-only routing, a protected disk, storage or export),
        // not an expired session: no logout.
        const isZboxRoute = /\/zpods\/[^/]+\/(networks|disks|storages|nfs)(\/|$)/.test(error.config?.url ?? "")
        if (error.response?.status === 403 && !isZboxRoute) {
          useAuthStore.getState().logout()
          useTargetStore.getState().clearActiveTarget()
        }
        return Promise.reject(error)
      }
    )

    return instance
  }, [targets, activeTargetId])

  return getClient
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
  speed: number
  eta: number
}

export function useApi() {
  const getClient = useApiClient()

  const fetchCurrentUser = useCallback(async (): Promise<User> => {
    const client = getClient()
    const { data } = await client.get<User>("/users/me")
    return data
  }, [getClient])

  const fetchZpods = useCallback(async (): Promise<Zpod[]> => {
    const client = getClient()
    const { data } = await client.get<Zpod[]>("/zpods")
    return data
  }, [getClient])

  const fetchComponents = useCallback(async (): Promise<ComponentFull[]> => {
    const client = getClient()
    const { data } = await client.get<ComponentFull[]>("/components")
    return data
  }, [getClient])

  const fetchLibraries = useCallback(async (): Promise<Library[]> => {
    const client = getClient()
    const { data } = await client.get<Library[]>("/libraries")
    return data
  }, [getClient])

  const fetchProfiles = useCallback(async (): Promise<Profile[]> => {
    const client = getClient()
    const { data } = await client.get<Profile[]>("/profiles")
    return data
  }, [getClient])

  const fetchSettings = useCallback(async (): Promise<Setting[]> => {
    const client = getClient()
    const { data } = await client.get<Setting[]>("/settings")
    return data
  }, [getClient])

  const createSetting = useCallback(
    async (payload: SettingCreate): Promise<Setting> => {
      const client = getClient()
      const { data } = await client.post<Setting>("/settings", payload)
      return data
    },
    [getClient]
  )

  const updateSetting = useCallback(
    async (id: number, payload: SettingUpdate): Promise<Setting> => {
      const client = getClient()
      const { data } = await client.patch<Setting>(`/settings/${id}`, payload)
      return data
    },
    [getClient]
  )

  const deleteSetting = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/settings/${id}`)
    },
    [getClient]
  )

  const fetchEndpoints = useCallback(async (): Promise<EndpointFull[]> => {
    const client = getClient()
    const { data } = await client.get<EndpointFull[]>("/endpoints")
    return data
  }, [getClient])

  const createEndpoint = useCallback(
    async (payload: EndpointCreate): Promise<EndpointFull> => {
      const client = getClient()
      const { data } = await client.post<EndpointFull>("/endpoints", payload)
      return data
    },
    [getClient]
  )

  const updateEndpointPasswords = useCallback(
    async (id: number, payload: EndpointPasswordUpdate): Promise<EndpointFull> => {
      const client = getClient()
      const { data } = await client.patch<EndpointFull>(`/endpoints/${id}`, payload)
      return data
    },
    [getClient]
  )

  const deleteEndpoint = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/endpoints/${id}`)
    },
    [getClient]
  )

  const fetchZpod = useCallback(
    async (id: number): Promise<Zpod> => {
      const client = getClient()
      const { data } = await client.get<Zpod>(`/zpods/${id}`)
      return data
    },
    [getClient]
  )

  const deleteZpod = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/zpods/${id}`)
    },
    [getClient]
  )

  const createZpod = useCallback(
    async (payload: ZpodCreate): Promise<Zpod> => {
      const client = getClient()
      const { data } = await client.post<Zpod>("/zpods", payload)
      return data
    },
    [getClient]
  )

  const getUploadedFileSize = useCallback(
    async (filename: string): Promise<number> => {
      const client = getClient()
      try {
        const { data } = await client.get<{ current_size: number }>(
          `/components/upload/${encodeURIComponent(filename)}`
        )
        return data?.current_size ?? 0
      } catch {
        return 0
      }
    },
    [getClient]
  )

  const uploadComponentChunk = useCallback(
    async (
      file: File,
      chunkSize: number,
      startOffset: number,
      onProgress: (progress: UploadProgress) => void,
      signal?: AbortSignal
    ): Promise<void> => {
      const client = getClient()
      const totalSize = file.size
      let offset = startOffset
      const startTime = Date.now()

      while (offset < totalSize) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

        const end = Math.min(offset + chunkSize, totalSize)
        const chunk = file.slice(offset, end)

        const form = new FormData()
        form.append("file", chunk)
        form.append("filename", file.name)
        form.append("offset", String(offset))
        form.append("file_size", String(totalSize))

        await client.post("/components/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
          signal,
        })

        offset = end

        const elapsed = (Date.now() - startTime) / 1000
        const uploaded = offset - startOffset
        const speed = elapsed > 0 ? uploaded / elapsed : 0
        const remaining = totalSize - offset
        const eta = speed > 0 ? remaining / speed : 0

        onProgress({
          loaded: offset,
          total: totalSize,
          percent: (offset / totalSize) * 100,
          speed,
          eta,
        })
      }
    },
    [getClient]
  )

  const createProfile = useCallback(
    async (payload: ProfileCreate): Promise<Profile> => {
      const client = getClient()
      const { data } = await client.post<Profile>("/profiles", payload)
      return data
    },
    [getClient]
  )

  const updateProfile = useCallback(
    async (id: number, payload: ProfileUpdate): Promise<Profile> => {
      const client = getClient()
      const { data } = await client.patch<Profile>(`/profiles/${id}`, payload)
      return data
    },
    [getClient]
  )

  const deleteProfile = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/profiles/${id}`)
    },
    [getClient]
  )

  const fetchZpodDns = useCallback(
    async (zpodId: number): Promise<ZpodDnsEntry[]> => {
      const client = getClient()
      const { data } = await client.get<ZpodDnsEntry[]>(`/zpods/${zpodId}/dns`)
      return data
    },
    [getClient]
  )

  const createZpodDns = useCallback(
    async (zpodId: number, payload: ZpodDnsCreate): Promise<void> => {
      const client = getClient()
      await client.post(`/zpods/${zpodId}/dns`, payload)
    },
    [getClient]
  )

  const deleteZpodDns = useCallback(
    async (zpodId: number, ip: string, hostname: string): Promise<void> => {
      const client = getClient()
      await client.delete(`/zpods/${zpodId}/dns/${ip}/${hostname}`)
    },
    [getClient]
  )

  const fetchZpodNetworks = useCallback(
    async (zpodId: number): Promise<ZpodNetworkView[]> => {
      const client = getClient()
      const { data } = await client.get<ZpodNetworkView[]>(`/zpods/${zpodId}/networks`)
      return data
    },
    [getClient]
  )

  const addZpodNetwork = useCallback(
    async (zpodId: number, payload: ZpodNetworkCreate): Promise<ZpodNetworkView> => {
      const client = getClient()
      const { data } = await client.post<ZpodNetworkView>(`/zpods/${zpodId}/networks`, payload)
      return data
    },
    [getClient]
  )

  const removeZpodNetwork = useCallback(
    async (zpodId: number, name: string): Promise<void> => {
      const client = getClient()
      await client.delete(`/zpods/${zpodId}/networks/${encodeURIComponent(name)}`)
    },
    [getClient]
  )

  const setZpodNetworkEnabled = useCallback(
    async (zpodId: number, name: string, enabled: boolean): Promise<ZpodNetworkView> => {
      const client = getClient()
      const action = enabled ? "enable" : "disable"
      const { data } = await client.put<ZpodNetworkView>(
        `/zpods/${zpodId}/networks/${encodeURIComponent(name)}/${action}`
      )
      return data
    },
    [getClient]
  )

  const setZpodNetworkMasquerade = useCallback(
    async (zpodId: number, name: string, enabled: boolean): Promise<ZpodNetworkView> => {
      const client = getClient()
      const { data } = await client.put<ZpodNetworkView>(
        `/zpods/${zpodId}/networks/${encodeURIComponent(name)}/masquerade`,
        { enabled }
      )
      return data
    },
    [getClient]
  )

  const setZpodNetworkRouting = useCallback(
    async (
      zpodId: number,
      name: string,
      routing: "LOCAL" | "GLOBAL",
      dryRun: boolean
    ): Promise<ZpodNetworkRoutingView> => {
      const client = getClient()
      const { data } = await client.put<ZpodNetworkRoutingView>(
        `/zpods/${zpodId}/networks/${encodeURIComponent(name)}/routing`,
        { routing, dry_run: dryRun }
      )
      return data
    },
    [getClient]
  )

  const fetchZpodNetworkRoutingRun = useCallback(
    async (zpodId: number, name: string, flowRunId: string): Promise<ZpodNetworkRoutingRunView> => {
      const client = getClient()
      const { data } = await client.get<ZpodNetworkRoutingRunView>(
        `/zpods/${zpodId}/networks/${encodeURIComponent(name)}/routing/${flowRunId}`
      )
      return data
    },
    [getClient]
  )

  // --- storage: disks (vCenter, through a flow run), storages and NFS exports (zboxapi) ---

  const fetchZpodDisks = useCallback(
    async (zpodId: number): Promise<ZpodDiskView[]> => {
      const { data } = await getClient().get<ZpodDiskView[]>(`/zpods/${zpodId}/disks`)
      return data
    },
    [getClient]
  )

  const fetchZpodDiskRun = useCallback(
    async (zpodId: number, flowRunId: string): Promise<ZpodDiskRunView> => {
      const { data } = await getClient().get<ZpodDiskRunView>(`/zpods/${zpodId}/disks/runs/${flowRunId}`)
      return data
    },
    [getClient]
  )

  const addZpodDisk = useCallback(
    async (zpodId: number, sizeGb: number): Promise<ZpodDiskRunView> => {
      const { data } = await getClient().post<ZpodDiskRunView>(`/zpods/${zpodId}/disks`, { size_gb: sizeGb })
      return data
    },
    [getClient]
  )

  const growZpodDisk = useCallback(
    async (zpodId: number, device: string, sizeGb: number): Promise<ZpodDiskRunView> => {
      const { data } = await getClient().put<ZpodDiskRunView>(
        `/zpods/${zpodId}/disks/${encodeURIComponent(diskName(device))}/grow`,
        { size_gb: sizeGb }
      )
      return data
    },
    [getClient]
  )

  const removeZpodDisk = useCallback(
    async (zpodId: number, device: string): Promise<ZpodDiskRunView> => {
      const { data } = await getClient().delete<ZpodDiskRunView>(
        `/zpods/${zpodId}/disks/${encodeURIComponent(diskName(device))}`
      )
      return data
    },
    [getClient]
  )

  const fetchZpodStorages = useCallback(
    async (zpodId: number): Promise<ZpodStorageView[]> => {
      const { data } = await getClient().get<ZpodStorageView[]>(`/zpods/${zpodId}/storages`)
      return data
    },
    [getClient]
  )

  const createZpodStorage = useCallback(
    async (
      zpodId: number,
      payload: { disk: string; lvm: boolean; name?: string | null },
      dryRun = false
    ): Promise<ZpodStorageOperation> => {
      const { data } = await getClient().post<ZpodStorageOperation>(`/zpods/${zpodId}/storages`, payload, {
        params: { dry_run: dryRun, verbose: true },
      })
      return data
    },
    [getClient]
  )

  const growZpodStorage = useCallback(
    async (zpodId: number, name: string): Promise<ZpodStorageOperation> => {
      const { data } = await getClient().put<ZpodStorageOperation>(
        `/zpods/${zpodId}/storages/${encodeURIComponent(name)}/grow`,
        undefined,
        { params: { verbose: true } }
      )
      return data
    },
    [getClient]
  )

  // Unmounts the storage; its filesystem and data stay on the disk.
  const deleteZpodStorage = useCallback(
    async (zpodId: number, name: string): Promise<ZpodStorageOperation> => {
      const { data } = await getClient().delete<ZpodStorageOperation>(
        `/zpods/${zpodId}/storages/${encodeURIComponent(name)}`
      )
      return data
    },
    [getClient]
  )

  const addZpodStorageFolder = useCallback(
    async (
      zpodId: number,
      storage: string,
      folder: string,
      payload: { owner?: string | null; mode?: string | null }
    ): Promise<ZpodStorageFolderView> => {
      const { data } = await getClient().post<ZpodStorageFolderView>(
        `/zpods/${zpodId}/storages/${encodeURIComponent(storage)}/folders/${encodeURIComponent(folder)}`,
        payload
      )
      return data
    },
    [getClient]
  )

  const setZpodStorageFolder = useCallback(
    async (
      zpodId: number,
      storage: string,
      folder: string,
      payload: { owner?: string | null; mode?: string | null; recursive: boolean }
    ): Promise<ZpodStorageFolderView> => {
      const { data } = await getClient().put<ZpodStorageFolderView>(
        `/zpods/${zpodId}/storages/${encodeURIComponent(storage)}/folders/${encodeURIComponent(folder)}`,
        payload
      )
      return data
    },
    [getClient]
  )

  const removeZpodStorageFolder = useCallback(
    async (zpodId: number, storage: string, folder: string, force: boolean): Promise<void> => {
      await getClient().delete(
        `/zpods/${zpodId}/storages/${encodeURIComponent(storage)}/folders/${encodeURIComponent(folder)}`,
        { params: { force } }
      )
    },
    [getClient]
  )

  const fetchZpodNfsExports = useCallback(
    async (zpodId: number): Promise<ZpodNfsExportView[]> => {
      const { data } = await getClient().get<ZpodNfsExportView[]>(`/zpods/${zpodId}/nfs`)
      return data
    },
    [getClient]
  )

  const fetchZpodNfsStatus = useCallback(
    async (zpodId: number): Promise<ZpodNfsStatus> => {
      const { data } = await getClient().get<ZpodNfsStatus>(`/zpods/${zpodId}/nfs/status`)
      return data
    },
    [getClient]
  )

  const addZpodNfsExport = useCallback(
    async (zpodId: number, payload: ZpodNfsCreate): Promise<ZpodNfsExportView> => {
      const { data } = await getClient().post<ZpodNfsExportView>(`/zpods/${zpodId}/nfs`, payload)
      return data
    },
    [getClient]
  )

  // Clients and options replaced as a whole
  const setZpodNfsExport = useCallback(
    async (
      zpodId: number,
      storage: string,
      folder: string,
      payload: { clients: string[]; options?: string | null }
    ): Promise<ZpodNfsExportView> => {
      const { data } = await getClient().put<ZpodNfsExportView>(
        `/zpods/${zpodId}/nfs/${encodeURIComponent(storage)}/${encodeURIComponent(folder)}`,
        payload
      )
      return data
    },
    [getClient]
  )

  // Stops exporting the folder; its files stay.
  const removeZpodNfsExport = useCallback(
    async (zpodId: number, storage: string, folder: string): Promise<void> => {
      await getClient().delete(`/zpods/${zpodId}/nfs/${encodeURIComponent(storage)}/${encodeURIComponent(folder)}`)
    },
    [getClient]
  )

  // `all` includes disabled users
  const fetchUsers = useCallback(
    async (all = false): Promise<User[]> => {
      const client = getClient()
      const { data } = await client.get<User[]>("/users", { params: all ? { all } : undefined })
      return data
    },
    [getClient]
  )

  const createUser = useCallback(
    async (payload: UserCreate): Promise<UserWithToken> => {
      const client = getClient()
      const { data } = await client.post<UserWithToken>("/users", payload)
      return data
    },
    [getClient]
  )

  const updateUser = useCallback(
    async (id: number, payload: UserUpdate): Promise<User> => {
      const client = getClient()
      const { data } = await client.patch<User>(`/users/${id}`, payload)
      return data
    },
    [getClient]
  )

  const deleteUser = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/users/${id}/delete`)
    },
    [getClient]
  )

  const enableUser = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.patch(`/users/${id}/enable`)
    },
    [getClient]
  )

  const disableUser = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.patch(`/users/${id}/disable`)
    },
    [getClient]
  )

  const resetUserApiToken = useCallback(
    async (id: number): Promise<UserWithToken> => {
      const client = getClient()
      const { data } = await client.patch<UserWithToken>(`/users/${id}/reset_api_token`)
      return data
    },
    [getClient]
  )

  const fetchPermissionGroups = useCallback(async (): Promise<PermissionGroup[]> => {
    const client = getClient()
    const { data } = await client.get<PermissionGroup[]>("/permission_groups")
    return data
  }, [getClient])

  const createPermissionGroup = useCallback(
    async (payload: PermissionGroupCreate): Promise<PermissionGroup> => {
      const client = getClient()
      const { data } = await client.post<PermissionGroup>("/permission_groups", payload)
      return data
    },
    [getClient]
  )

  const renamePermissionGroup = useCallback(
    async (id: number, payload: PermissionGroupCreate): Promise<void> => {
      const client = getClient()
      await client.patch(`/permission_groups/${id}`, payload)
    },
    [getClient]
  )

  const deletePermissionGroup = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/permission_groups/${id}`)
    },
    [getClient]
  )

  const addPermissionGroupUser = useCallback(
    async (groupId: number, userId: number): Promise<void> => {
      const client = getClient()
      await client.post(`/permission_groups/${groupId}/users`, { user_id: userId })
    },
    [getClient]
  )

  const removePermissionGroupUser = useCallback(
    async (groupId: number, userId: number): Promise<void> => {
      const client = getClient()
      await client.delete(`/permission_groups/${groupId}/users/${userId}`)
    },
    [getClient]
  )

  const fetchEndpointPermissions = useCallback(
    async (endpointId: number): Promise<EndpointPermissionView[]> => {
      const client = getClient()
      const { data } = await client.get<EndpointPermissionView[]>(
        `/endpoints/${endpointId}/permissions`
      )
      return data
    },
    [getClient]
  )

  const addEndpointPermissionUser = useCallback(
    async (
      endpointId: number,
      permission: EndpointPermission,
      payload: ZpodPermissionUserAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.post(`/endpoints/${endpointId}/permissions/${permission}/users`, payload)
    },
    [getClient]
  )

  const removeEndpointPermissionUser = useCallback(
    async (
      endpointId: number,
      permission: EndpointPermission,
      payload: ZpodPermissionUserAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.delete(`/endpoints/${endpointId}/permissions/${permission}/users`, {
        data: payload,
      })
    },
    [getClient]
  )

  const addEndpointPermissionGroup = useCallback(
    async (
      endpointId: number,
      permission: EndpointPermission,
      payload: ZpodPermissionGroupAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.post(`/endpoints/${endpointId}/permissions/${permission}/groups`, payload)
    },
    [getClient]
  )

  const removeEndpointPermissionGroup = useCallback(
    async (
      endpointId: number,
      permission: EndpointPermission,
      payload: ZpodPermissionGroupAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.delete(`/endpoints/${endpointId}/permissions/${permission}/groups`, {
        data: payload,
      })
    },
    [getClient]
  )

  const fetchZpodMyPermission = useCallback(
    async (zpodId: number): Promise<ZpodPermissionMineView> => {
      const client = getClient()
      const { data } = await client.get<ZpodPermissionMineView>(
        `/zpods/${zpodId}/permissions/mine`
      )
      return data
    },
    [getClient]
  )

  const addZpodPermissionUser = useCallback(
    async (
      zpodId: number,
      permission: ZpodPermission,
      payload: ZpodPermissionUserAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.post(`/zpods/${zpodId}/permissions/${permission}/users`, payload)
    },
    [getClient]
  )

  const removeZpodPermissionUser = useCallback(
    async (
      zpodId: number,
      permission: ZpodPermission,
      payload: ZpodPermissionUserAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.delete(`/zpods/${zpodId}/permissions/${permission}/users`, {
        data: payload,
      })
    },
    [getClient]
  )

  const addZpodPermissionGroup = useCallback(
    async (
      zpodId: number,
      permission: ZpodPermission,
      payload: ZpodPermissionGroupAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.post(`/zpods/${zpodId}/permissions/${permission}/groups`, payload)
    },
    [getClient]
  )

  const removeZpodPermissionGroup = useCallback(
    async (
      zpodId: number,
      permission: ZpodPermission,
      payload: ZpodPermissionGroupAddRemove
    ): Promise<void> => {
      const client = getClient()
      await client.delete(`/zpods/${zpodId}/permissions/${permission}/groups`, {
        data: payload,
      })
    },
    [getClient]
  )

  const deleteZpodComponent = useCallback(
    async (zpodId: number, componentId: string): Promise<void> => {
      const client = getClient()
      await client.delete(`/zpods/${zpodId}/components/${componentId}`)
    },
    [getClient]
  )

  const addZpodComponent = useCallback(
    async (zpodId: number, payload: ProfileItemCreate): Promise<void> => {
      const client = getClient()
      await client.post(`/zpods/${zpodId}/components`, payload)
    },
    [getClient]
  )

  const enableComponent = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.put(`/components/${id}/enable`)
    },
    [getClient]
  )

  const disableComponent = useCallback(
    async (id: number): Promise<void> => {
      const client = getClient()
      await client.put(`/components/${id}/disable`)
    },
    [getClient]
  )

  const resyncLibrary = useCallback(
    async (id: string): Promise<void> => {
      const client = getClient()
      await client.put(`/libraries/${id}/sync`)
    },
    [getClient]
  )

  return {
    fetchCurrentUser,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    enableUser,
    disableUser,
    resetUserApiToken,
    fetchPermissionGroups,
    createPermissionGroup,
    renamePermissionGroup,
    deletePermissionGroup,
    addPermissionGroupUser,
    removePermissionGroupUser,
    fetchEndpointPermissions,
    addEndpointPermissionUser,
    removeEndpointPermissionUser,
    addEndpointPermissionGroup,
    removeEndpointPermissionGroup,
    fetchZpods,
    fetchZpod,
    deleteZpod,
    createZpod,
    fetchComponents,
    addZpodComponent,
    deleteZpodComponent,
    fetchZpodDns,
    createZpodDns,
    deleteZpodDns,
    fetchZpodNetworks,
    addZpodNetwork,
    removeZpodNetwork,
    setZpodNetworkEnabled,
    setZpodNetworkMasquerade,
    setZpodNetworkRouting,
    fetchZpodNetworkRoutingRun,
    fetchZpodDisks,
    fetchZpodDiskRun,
    addZpodDisk,
    growZpodDisk,
    removeZpodDisk,
    fetchZpodStorages,
    createZpodStorage,
    growZpodStorage,
    deleteZpodStorage,
    addZpodStorageFolder,
    setZpodStorageFolder,
    removeZpodStorageFolder,
    fetchZpodNfsExports,
    fetchZpodNfsStatus,
    addZpodNfsExport,
    setZpodNfsExport,
    removeZpodNfsExport,
    fetchZpodMyPermission,
    addZpodPermissionUser,
    removeZpodPermissionUser,
    addZpodPermissionGroup,
    removeZpodPermissionGroup,
    enableComponent,
    disableComponent,
    fetchLibraries,
    resyncLibrary,
    fetchProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    fetchSettings,
    createSetting,
    updateSetting,
    deleteSetting,
    fetchEndpoints,
    createEndpoint,
    updateEndpointPasswords,
    deleteEndpoint,
    getUploadedFileSize,
    uploadComponentChunk,
  }
}

export async function validateTarget(
  url: string,
  token: string
): Promise<User> {
  const { data } = await axios.get<User>("/api/users/me", {
    headers: {
      access_token: token,
      "X-Target-Url": url,
    },
  })
  return data
}
