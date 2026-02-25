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

export interface ZpodNetwork {
  id: number
  cidr: string
}

export interface ZpodPermissionView {
  id: number
  permission: string
  users: User[]
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
