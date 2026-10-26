export interface TargetProfile {
  id: string
  name: string
  url: string
  token: string
  lastConnected?: string
}

export interface User {
  id: number
  username: string
  email: string
  description: string | null
  superadmin: boolean
  status: string
  creation_date: string
  last_connection_date: string | null
  // Only returned by GET /users, to superadmins or for one's own row
  api_token?: string | null
}

export interface UserWithToken extends User {
  api_token: string
}

export interface UserCreate {
  username: string
  email: string
  description?: string
  ssh_key?: string
  superadmin?: boolean
}

export interface UserUpdate {
  email?: string | null
  description?: string | null
  ssh_key?: string | null
  // Ignored by the API unless the caller is a superadmin
  superadmin?: boolean | null
}

export const ZpodStatus = {
  ACTIVE: "ACTIVE",
  BUILDING: "BUILDING",
  CONFIG_SCRIPTS: "CONFIG_SCRIPTS",
  DELETED: "DELETED",
  DELETING: "DELETING",
  DEPLOY_FAILED: "DEPLOY_FAILED",
  DESTROY_FAILED: "DESTROY_FAILED",
  PENDING: "PENDING",
} as const

export type ZpodStatus = (typeof ZpodStatus)[keyof typeof ZpodStatus]

export interface Endpoint {
  id: number
  name: string
  description: string
  status: string
}

export interface EndpointCompute {
  driver: string
  hostname: string
  username: string
  datacenter: string
  resource_pool: string
  storage_policy: string
  storage_datastore: string
  contentlibrary: string
  vmfolder: string
  vds: string
}

export interface EndpointNetwork {
  driver: string
  hostname: string
  username: string
  networks: string
  transportzone: string
  edgecluster: string
  t0: string
}

export interface EndpointFull extends Endpoint {
  endpoints: {
    compute: EndpointCompute
    network: EndpointNetwork
  }
}

export interface EndpointComputeCreate {
  driver: string
  hostname: string
  username: string
  password: string
  datacenter: string
  resource_pool: string
  storage_datastore: string
  storage_policy: string
  contentlibrary: string
  vmfolder: string
  vds: string
}

export interface EndpointNetworkCreate {
  driver: string
  hostname: string
  username: string
  password: string
  networks: string
  transportzone: string
  edgecluster: string
  t0: string
}

export interface EndpointCreate {
  name: string
  description: string
  endpoints: {
    compute: EndpointComputeCreate
    network: EndpointNetworkCreate
  }
}

export interface EndpointPasswordUpdate {
  endpoints: {
    compute: { password: string }
    network: { password: string }
  }
}

// --- Inventory types (used by endpoint create/edit dialogs and test server) ---

export interface DatastoreItem {
  moRef: string
  name: string
  capacityGB: number
  usedGB: number
  type: string
}

export interface ResourcePoolItem {
  name: string
  type: "cluster" | "resource_pool"
}

export interface VmFolderTreeItem {
  name: string
  children: VmFolderTreeItem[]
}

export interface VsphereInventory {
  datacenters: string[]
  resourcePools: ResourcePoolItem[]
  datastores: DatastoreItem[]
  vmFolders: VmFolderTreeItem[]
  vds: string[]
}

export interface NsxInventory {
  transportZones: string[]
  edgeClusters: string[]
  t0Gateways: string[]
}

export interface InventoryResult<T> {
  connected: boolean
  version?: string
  error?: string
  inventory?: T
}

export interface ComponentFull {
  id: number
  component_uid: string
  component_name: string
  component_version: string
  component_description: string
  library_name: string
  filename: string
  jsonfile: string
  status: string
  download_status: string | null
  file_checksum: string
}

export interface Library {
  id: number
  name: string
  description: string
  git_url: string
  enabled: boolean
  creation_date: string
  last_modified_date: string | null
}

export interface ProfileItem {
  component_uid: string
  host_id: number | null
  hostname: string | null
  vcpu: number | null
  vmem: number | null
  vnics: number | null
  vdisks: number[] | null
}

export interface Profile {
  id: number
  name: string
  profile: (ProfileItem | ProfileItem[])[]
  creation_date: string
  last_modified_date: string
}

export interface ProfileItemCreate {
  component_uid: string
  host_id?: number | null
  hostname?: string | null
  vcpu?: number | null
  vmem?: number | null
  vnics?: number | null
  vdisks?: number[] | null
}

export interface ProfileCreate {
  name: string
  profile: (ProfileItemCreate | ProfileItemCreate[])[]
}

export interface ProfileUpdate {
  name?: string | null
  profile?: (ProfileItemCreate | ProfileItemCreate[])[] | null
}

export interface Setting {
  id: number
  name: string
  description: string
  value: string
}

export interface SettingCreate {
  name: string
  description: string
  value: string
}

export interface SettingUpdate {
  description?: string | null
  value?: string | null
}

export interface ZpodComponentView {
  component: {
    id: number
    component_uid: string
    component_name: string
    component_version: string
    component_description: string
  }
  ip: string | null
  hostname: string | null
  fqdn: string | null
  password: string | null
  usernames: { username: string; type: string }[]
  status: string
}

export const ZpodNetworkKind = {
  ZPOD: "zpod",
  USER: "user",
  ZCORE: "zcore",
} as const

export type ZpodNetworkKind = (typeof ZpodNetworkKind)[keyof typeof ZpodNetworkKind]

export const ZpodNetworkRouting = {
  LOCAL: "LOCAL",
  GLOBAL: "GLOBAL",
  PENDING: "PENDING",
} as const

export type ZpodNetworkRouting = (typeof ZpodNetworkRouting)[keyof typeof ZpodNetworkRouting]

export const ZpodNetworkStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  MISSING: "MISSING",
  UNKNOWN: "UNKNOWN",
} as const

export type ZpodNetworkStatus = (typeof ZpodNetworkStatus)[keyof typeof ZpodNetworkStatus]

/** A network as embedded in the zPod view. The fields after `cidr` come with
 *  zpodapi's user networks; an older zpodapi sends `id` and `cidr` only. */
export interface ZpodNetwork {
  id: number | null
  cidr: string
  name?: string
  vlan_id?: number
  gateway?: string
  kind?: ZpodNetworkKind
  masquerade?: boolean
  routing?: ZpodNetworkRouting
}

/** GET /zpods/{id}/networks: every network on the box, with its live status. */
export interface ZpodNetworkView {
  id: number | null // null for the zcore rows, which exist on the box only
  name: string
  cidr: string
  vlan_id: number
  gateway: string // with prefix, e.g. "10.42.111.1/24"
  kind: ZpodNetworkKind
  masquerade: boolean
  routing: ZpodNetworkRouting
  status: ZpodNetworkStatus
}

export interface ZpodNetworkCreate {
  name: string
  vlan: number
  gateway: string
  masquerade: boolean
  routing: Exclude<ZpodNetworkRouting, "PENDING">
}

export interface ZpodNetworkRoutingView {
  network: ZpodNetworkView
  flow_run_id: string | null // null when nothing had to change
}

/** A routing flow run as zpodengine reports it. `state` is Prefect's state type. */
export interface ZpodNetworkRoutingRunView {
  network: ZpodNetworkView
  flow_run_id: string
  name: string | null
  state: string
  message: string | null // for a failed run, the failing check
}

export const ZpodPermission = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  USER: "USER",
} as const

export type ZpodPermission = (typeof ZpodPermission)[keyof typeof ZpodPermission]

export interface PermissionGroup {
  id: number
  name: string
  users: User[]
}

export interface PermissionGroupCreate {
  name: string
}

export const EndpointPermission = {
  USER: "USER",
} as const

export type EndpointPermission = (typeof EndpointPermission)[keyof typeof EndpointPermission]

export interface EndpointPermissionView {
  id: number
  permission: EndpointPermission
  users: User[]
  permission_groups: PermissionGroup[]
}

export interface ZpodPermissionView {
  id: number
  permission: ZpodPermission
  users: User[]
  permission_groups: PermissionGroup[]
}

export interface ZpodPermissionMineView {
  permission: ZpodPermission
}

export interface ZpodPermissionUserAddRemove {
  user_id?: number | null
  username?: string | null
}

export interface ZpodPermissionGroupAddRemove {
  group_id?: number | null
  groupname?: string | null
}

export interface ZpodCreate {
  name: string
  endpoint_id: number
  profile: string
  domain?: string
}

export interface Zpod {
  id: number
  name: string
  description: string | null
  password: string | null
  domain: string
  profile: string
  status: ZpodStatus
  creation_date: string
  last_modified_date: string | null
  features: Record<string, unknown> | null
  endpoint: Endpoint | null
  networks: ZpodNetwork[]
  components: ZpodComponentView[]
  permissions: ZpodPermissionView[]
}

export interface ZpodDnsEntry {
  ip: string
  hostname: string
}

export interface ZpodDnsCreate {
  hostname: string
  ip?: string | null
  host_id?: number | null
}
