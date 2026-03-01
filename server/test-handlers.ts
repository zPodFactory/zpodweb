import type { IncomingMessage, ServerResponse } from "http"
import { highlight } from "cli-highlight"
import * as vsphere from "./vsphere-client.js"
import * as nsx from "./nsx-client.js"

function redactPasswords(obj: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...obj }
  if (copy.password) copy.password = "***"
  return copy
}

function logRequest(
  route: string,
  status: number,
  ms: number,
  reqBody: Record<string, unknown>,
  resBody: unknown
) {
  console.log(highlight(`// POST ${route} → ${status} (${ms}ms)`, { language: "javascript" }))
  console.log(highlight(`// → req`, { language: "javascript" }))
  console.log(highlight(JSON.stringify(redactPasswords(reqBody), null, 2), { language: "json" }))
  console.log(highlight(`// ← res`, { language: "javascript" }))
  console.log(highlight(JSON.stringify(resBody, null, 2), { language: "json" }))
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString()))
    req.on("error", () => resolve(""))
  })
}

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  route: string,
  start: number,
  reqBody: Record<string, unknown>
) {
  const ms = Date.now() - start
  logRequest(route, status, ms, reqBody, data)
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(data))
}

export async function handleVsphereTest(
  req: IncomingMessage,
  res: ServerResponse
) {
  const start = Date.now()
  const route = "/test/vsphere"

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" }, route, start, {})
    return
  }

  const raw = await collectBody(req)
  let body: {
    hostname?: string
    username?: string
    password?: string
    datacenter?: string
    resource_pool?: string
    storage_datastore?: string
    vmfolder?: string
  }
  try {
    body = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" }, route, start, {})
    return
  }

  const { hostname, username, password, datacenter, resource_pool, storage_datastore, vmfolder } = body

  if (!hostname || !username || !password) {
    sendJson(res, 400, { error: "hostname, username, and password are required" }, route, start, body)
    return
  }

  let session: vsphere.VsphereSession
  try {
    session = await vsphere.connect(hostname, username, password)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unable to connect"
    sendJson(res, 200, { connected: false, error: msg }, route, start, body)
    return
  }

  const checks: Record<string, { ok: boolean; capacityGB?: number; usedGB?: number }> = {}

  if (datacenter) {
    checks.datacenter = { ok: await vsphere.checkDatacenter(session, datacenter) }
  }
  if (resource_pool) {
    checks.resource_pool = { ok: await vsphere.checkResourcePool(session, resource_pool) }
  }
  if (storage_datastore) {
    const dsInfo = await vsphere.checkDatastore(session, storage_datastore)
    checks.storage_datastore = dsInfo.exists
      ? { ok: true, capacityGB: dsInfo.capacityGB, usedGB: dsInfo.usedGB }
      : { ok: false }
  }
  if (vmfolder) {
    checks.vmfolder = { ok: await vsphere.checkVmFolder(session, vmfolder) }
  }

  const result = {
    connected: true,
    version: session.version,
    checks,
  }
  sendJson(res, 200, result, route, start, body)
}

export async function handleNsxTest(
  req: IncomingMessage,
  res: ServerResponse
) {
  const start = Date.now()
  const route = "/test/nsx"

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" }, route, start, {})
    return
  }

  const raw = await collectBody(req)
  let body: {
    hostname?: string
    username?: string
    password?: string
    edgecluster?: string
    t0?: string
    transportzone?: string
    networks?: string
  }
  try {
    body = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" }, route, start, {})
    return
  }

  const { hostname, username, password, edgecluster, t0, transportzone, networks } = body

  if (!hostname || !username || !password) {
    sendJson(res, 400, { error: "hostname, username, and password are required" }, route, start, body)
    return
  }

  let session: nsx.NsxSession
  try {
    session = await nsx.connect(hostname, username, password)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unable to connect"
    sendJson(res, 200, { connected: false, error: msg }, route, start, body)
    return
  }

  const checks: Record<string, { ok: boolean; cidr?: string; zpodCapacity?: number }> = {}

  if (edgecluster) {
    checks.edgecluster = { ok: await nsx.checkEdgeCluster(session, edgecluster) }
  }
  if (t0) {
    checks.t0 = { ok: await nsx.checkT0(session, t0) }
  }
  if (transportzone) {
    checks.transportzone = { ok: await nsx.checkTransportZone(session, transportzone) }
  }
  if (networks) {
    // Validate CIDR format and calculate zpod capacity
    const cidrMatch = networks.match(/\/(\d+)$/)
    if (cidrMatch) {
      const prefix = parseInt(cidrMatch[1], 10)
      if (prefix <= 21) {
        const zpodCapacity = Math.pow(2, 24 - prefix)
        checks.networks = { ok: true, cidr: `/${prefix}`, zpodCapacity }
      } else {
        checks.networks = { ok: false }
      }
    } else {
      checks.networks = { ok: true }
    }
  }

  const result = {
    connected: true,
    version: session.version,
    checks,
  }
  sendJson(res, 200, result, route, start, body)
}

export async function handleVsphereInventory(
  req: IncomingMessage,
  res: ServerResponse
) {
  const start = Date.now()
  const route = "/test/vsphere/inventory"

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" }, route, start, {})
    return
  }

  const raw = await collectBody(req)
  let body: { hostname?: string; username?: string; password?: string }
  try {
    body = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" }, route, start, {})
    return
  }

  const { hostname, username, password } = body
  if (!hostname || !username || !password) {
    sendJson(res, 400, { error: "hostname, username, and password are required" }, route, start, body)
    return
  }

  let session: vsphere.VsphereSession
  try {
    session = await vsphere.connect(hostname, username, password)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unable to connect"
    sendJson(res, 200, { connected: false, error: msg }, route, start, body)
    return
  }

  const [datacenters, resourcePools, datastores, vmFolders] = await Promise.all([
    vsphere.listDatacenters(session),
    vsphere.listResourcePools(session),
    vsphere.listDatastores(session),
    vsphere.listVmFolders(session),
  ])

  const result = {
    connected: true,
    version: session.version,
    inventory: { datacenters, resourcePools, datastores, vmFolders },
  }
  sendJson(res, 200, result, route, start, body)
}

export async function handleNsxInventory(
  req: IncomingMessage,
  res: ServerResponse
) {
  const start = Date.now()
  const route = "/test/nsx/inventory"

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" }, route, start, {})
    return
  }

  const raw = await collectBody(req)
  let body: { hostname?: string; username?: string; password?: string }
  try {
    body = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" }, route, start, {})
    return
  }

  const { hostname, username, password } = body
  if (!hostname || !username || !password) {
    sendJson(res, 400, { error: "hostname, username, and password are required" }, route, start, body)
    return
  }

  let session: nsx.NsxSession
  try {
    session = await nsx.connect(hostname, username, password)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unable to connect"
    sendJson(res, 200, { connected: false, error: msg }, route, start, body)
    return
  }

  const [transportZones, edgeClusters, t0Gateways] = await Promise.all([
    nsx.listTransportZones(session),
    nsx.listEdgeClusters(session),
    nsx.listT0Gateways(session),
  ])

  const result = {
    connected: true,
    version: session.version,
    inventory: { transportZones, edgeClusters, t0Gateways },
  }
  sendJson(res, 200, result, route, start, body)
}
