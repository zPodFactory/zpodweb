import { useCallback } from "react"
import axios, { type AxiosInstance } from "axios"
import { useTargetStore } from "@/stores/target-store"
import { useAuthStore } from "@/stores/auth-store"
import type {
  User,
  Zpod,
  ZpodCreate,
  ZpodDnsEntry,
  ZpodDnsCreate,
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
} from "@/types"

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
        if (error.response?.status === 403) {
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
