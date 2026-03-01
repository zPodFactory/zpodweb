import { request as httpsRequest } from "https"
import { highlight } from "cli-highlight"

// ─── SOAP debug logging ─────────────────────────────────────────────────────

const debugEnabled = process.env.DEBUG_API_VSPHERE === "true"

function formatXml(xml: string): string {
  let indent = 0
  return xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .map((line) => {
      line = line.trim()
      if (!line) return ""
      if (line.startsWith("</")) indent--
      const pad = "  ".repeat(Math.max(indent, 0))
      if (line.startsWith("<") && !line.startsWith("</") && !line.startsWith("<?") && !line.endsWith("/>") && !/<\/[^>]+>$/.test(line)) indent++
      return pad + line
    })
    .filter(Boolean)
    .join("\n")
}

// ─── SOAP transport ──────────────────────────────────────────────────────────

interface SoapResponse {
  status: number
  body: string
  cookies: string[]
}

function soapRequest(
  host: string,
  body: string,
  soapAction: string,
  cookies?: string[]
): Promise<SoapResponse> {
  const action = soapAction.replace("urn:vim25/", "")

  if (debugEnabled) {
    console.log(highlight(`\n<!-- SOAP ${action} → ${host} -->`, { language: "xml" }))
    console.log(highlight(formatXml(body), { language: "xml" }))
  }

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    }
    if (cookies?.length) {
      headers["Cookie"] = cookies.join("; ")
    }

    const req = httpsRequest(
      {
        hostname: host,
        port: 443,
        path: "/sdk",
        method: "POST",
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          const setCookies = (res.headers["set-cookie"] || []).map(
            (c) => c.split(";")[0]
          )
          const responseBody = Buffer.concat(chunks).toString()

          if (debugEnabled) {
            console.log(highlight(`<!-- SOAP ${action} ← ${res.statusCode} -->`, { language: "xml" }))
            console.log(highlight(formatXml(responseBody), { language: "xml" }))
          }

          resolve({
            status: res.statusCode || 500,
            body: responseBody,
            cookies: setCookies,
          })
        })
        res.on("error", reject)
      }
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)
  const m = xml.match(re)
  return m ? m[1] : ""
}

interface ParsedObject {
  type: string
  moRef: string
  props: Record<string, string>
}

function parseReturnValues(xml: string): ParsedObject[] {
  const results: ParsedObject[] = []
  const blocks = xml.split(/<returnval[^>]*>/).slice(1)
  for (const block of blocks) {
    const objMatch = block.match(/<obj[^>]*type="([^"]+)"[^>]*>([^<]+)<\/obj>/)
    if (!objMatch) continue

    const props: Record<string, string> = {}

    // Parse each <propSet> block: one <name> + one or more <val>
    const propSetRe = /<propSet>([\s\S]*?)<\/propSet>/g
    let ps
    while ((ps = propSetRe.exec(block)) !== null) {
      const nameMatch = ps[1].match(/<name[^>]*>([^<]*)<\/name>/)
      if (!nameMatch) continue
      const propName = nameMatch[1]
      const valMatch = ps[1].match(/<val[^>]*>([^<]*)<\/val>/)
      if (valMatch && !props[propName]) {
        props[propName] = valMatch[1]
      }
    }

    results.push({ type: objMatch[1], moRef: objMatch[2], props })
  }
  return results
}

// ─── TraversalSpec builder ───────────────────────────────────────────────────

interface TraversalDef {
  name: string
  type: string
  path: string
  selectSet: string[]
}

const TRAVERSE_FOLDER: TraversalDef = {
  name: "traverseFolder",
  type: "Folder",
  path: "childEntity",
  selectSet: ["traverseFolder"],
}

const TRAVERSE_DC_HOST: TraversalDef = {
  name: "traverseDC",
  type: "Datacenter",
  path: "hostFolder",
  selectSet: ["traverseFolder"],
}

const TRAVERSE_DC_DATASTORE: TraversalDef = {
  name: "traverseDC",
  type: "Datacenter",
  path: "datastoreFolder",
  selectSet: ["traverseFolder"],
}

const TRAVERSE_DC_VM: TraversalDef = {
  name: "traverseDC",
  type: "Datacenter",
  path: "vmFolder",
  selectSet: ["traverseFolder"],
}

const TRAVERSE_CR_RP: TraversalDef = {
  name: "traverseCR",
  type: "ComputeResource",
  path: "resourcePool",
  selectSet: ["traverseRP"],
}

const TRAVERSE_RP: TraversalDef = {
  name: "traverseRP",
  type: "ResourcePool",
  path: "resourcePool",
  selectSet: ["traverseRP"],
}

function buildTraversalXml(traversals: TraversalDef[]): string {
  return traversals
    .map((t) => {
      const selects = t.selectSet
        .map((s) => `<vim25:selectSet><vim25:name>${s}</vim25:name></vim25:selectSet>`)
        .join("")
      return `<vim25:selectSet xsi:type="vim25:TraversalSpec" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <vim25:name>${t.name}</vim25:name>
        <vim25:type>${t.type}</vim25:type>
        <vim25:path>${t.path}</vim25:path>
        ${selects}
      </vim25:selectSet>`
    })
    .join("")
}

// ─── Unified RetrieveProperties ──────────────────────────────────────────────

const ENVELOPE_START = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
<soapenv:Body>`

const ENVELOPE_END = `</soapenv:Body></soapenv:Envelope>`

interface PropertyQuery {
  type: string
  pathSet: string[]
  traversals: TraversalDef[]
}

async function retrieveProperties(
  session: VsphereSession,
  query: PropertyQuery
): Promise<ParsedObject[]> {
  // Wire up traversals: the folder traversal's selectSet needs references to subsequent traversals
  const folderTraversal = query.traversals.find((t) => t.name === "traverseFolder")
  if (folderTraversal) {
    const otherNames = query.traversals
      .filter((t) => t.name !== "traverseFolder")
      .map((t) => t.name)
    const mergedFolder: TraversalDef = {
      ...folderTraversal,
      selectSet: [...new Set([...folderTraversal.selectSet, ...otherNames])],
    }
    query = {
      ...query,
      traversals: [mergedFolder, ...query.traversals.filter((t) => t.name !== "traverseFolder")],
    }
  }

  const pathSetXml = query.pathSet
    .map((p) => `<vim25:pathSet>${p}</vim25:pathSet>`)
    .join("")

  const body = `${ENVELOPE_START}
<vim25:RetrieveProperties>
  <vim25:_this type="PropertyCollector">${session.propertyCollector}</vim25:_this>
  <vim25:specSet>
    <vim25:propSet>
      <vim25:type>${query.type}</vim25:type>
      ${pathSetXml}
    </vim25:propSet>
    <vim25:objectSet>
      <vim25:obj type="Folder">${session.rootFolder}</vim25:obj>
      ${buildTraversalXml(query.traversals)}
    </vim25:objectSet>
  </vim25:specSet>
</vim25:RetrieveProperties>
${ENVELOPE_END}`

  const res = await soapRequest(
    session.host,
    body,
    "urn:vim25/RetrieveProperties",
    session.cookies
  )
  return parseReturnValues(res.body)
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface VsphereSession {
  cookies: string[]
  host: string
  version: string
  propertyCollector: string
  rootFolder: string
}

export interface DatastoreInfo {
  exists: boolean
  capacityGB?: number
  usedGB?: number
}

export interface ResourcePoolItem {
  name: string
  type: "cluster" | "resource_pool"
}

export interface DatastoreListItem {
  moRef: string
  name: string
  capacityGB: number
  usedGB: number
  type: string
}

export interface VmFolderTreeItem {
  name: string
  children: VmFolderTreeItem[]
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function connect(
  host: string,
  username: string,
  password: string
): Promise<VsphereSession> {
  const contentBody = `${ENVELOPE_START}
<vim25:RetrieveServiceContent>
  <vim25:_this type="ServiceInstance">ServiceInstance</vim25:_this>
</vim25:RetrieveServiceContent>
${ENVELOPE_END}`

  const contentRes = await soapRequest(
    host,
    contentBody,
    "urn:vim25/RetrieveServiceContent"
  )
  if (contentRes.status !== 200) {
    throw new Error("Unable to connect")
  }

  const sessionManager = extractTag(contentRes.body, "sessionManager")
  const propertyCollector = extractTag(contentRes.body, "propertyCollector")
  const rootFolder = extractTag(contentRes.body, "rootFolder")
  const version = extractTag(contentRes.body, "version")
  const fullName = extractTag(contentRes.body, "fullName")

  if (!sessionManager || !propertyCollector || !rootFolder) {
    throw new Error("Unable to parse ServiceContent")
  }

  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  const loginBody = `${ENVELOPE_START}
<vim25:Login>
  <vim25:_this type="SessionManager">${sessionManager}</vim25:_this>
  <vim25:userName>${escXml(username)}</vim25:userName>
  <vim25:password>${escXml(password)}</vim25:password>
</vim25:Login>
${ENVELOPE_END}`

  const loginRes = await soapRequest(host, loginBody, "urn:vim25/Login")
  if (loginRes.status !== 200) {
    if (loginRes.body.includes("InvalidLogin")) {
      throw new Error("Invalid credentials")
    }
    throw new Error("Login failed")
  }

  return {
    cookies: loginRes.cookies,
    host,
    version: (fullName || version).replace(/^VMware vCenter Server\s*/i, ""),
    propertyCollector,
    rootFolder,
  }
}

export async function listDatacenters(
  session: VsphereSession
): Promise<string[]> {
  const results = await retrieveProperties(session, {
    type: "Datacenter",
    pathSet: ["name"],
    traversals: [TRAVERSE_FOLDER],
  })
  return results.map((r) => r.props["name"]).filter(Boolean).sort()
}

export async function checkDatacenter(
  session: VsphereSession,
  name: string
): Promise<boolean> {
  const dcs = await listDatacenters(session)
  return dcs.includes(name)
}

export async function listResourcePools(
  session: VsphereSession
): Promise<ResourcePoolItem[]> {
  const [clusterResults, rpResults] = await Promise.all([
    retrieveProperties(session, {
      type: "ComputeResource",
      pathSet: ["name"],
      traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_HOST],
    }),
    retrieveProperties(session, {
      type: "ResourcePool",
      pathSet: ["name"],
      traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_HOST, TRAVERSE_CR_RP, TRAVERSE_RP],
    }),
  ])

  const clusters: ResourcePoolItem[] = clusterResults
    .map((r) => r.props["name"])
    .filter(Boolean)
    .sort()
    .map((name) => ({ name, type: "cluster" as const }))

  const resourcePools: ResourcePoolItem[] = rpResults
    .filter((r) => r.type === "ResourcePool" && r.props["name"] && r.props["name"] !== "Resources")
    .map((r) => ({ name: r.props["name"], type: "resource_pool" as const }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...clusters, ...resourcePools]
}

export async function checkResourcePool(
  session: VsphereSession,
  name: string
): Promise<boolean> {
  const results = await retrieveProperties(session, {
    type: "ComputeResource",
    pathSet: ["name"],
    traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_HOST],
  })
  return results.some((r) => r.props["name"] === name)
}

export async function listDatastores(
  session: VsphereSession
): Promise<DatastoreListItem[]> {
  // Query StoragePods and Datastores in parallel.
  // Datastores include their "parent" property — if a datastore's parent
  // MoRef matches a StoragePod MoRef, it belongs to that cluster.
  const [podResults, dsResults] = await Promise.all([
    retrieveProperties(session, {
      type: "StoragePod",
      pathSet: ["name", "summary.capacity", "summary.freeSpace"],
      traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_DATASTORE],
    }),
    retrieveProperties(session, {
      type: "Datastore",
      pathSet: ["name", "summary.capacity", "summary.freeSpace", "summary.multipleHostAccess", "summary.type", "parent"],
      traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_DATASTORE],
    }),
  ])

  // Collect StoragePod MoRefs
  const podMoRefs = new Set(podResults.map((r) => r.moRef))

  // Standalone datastores: shared + parent is not a StoragePod
  const datastores: DatastoreListItem[] = dsResults
    .filter((r) =>
      r.props["name"] &&
      r.props["summary.multipleHostAccess"] === "true" &&
      !podMoRefs.has(r.props["parent"])
    )
    .map((r) => {
      const capacity = Number(r.props["summary.capacity"]) || 0
      const freeSpace = Number(r.props["summary.freeSpace"]) || 0
      return {
        moRef: r.moRef,
        name: r.props["name"],
        type: r.props["summary.type"] || "unknown",
        capacityGB: Math.round(capacity / 1073741824),
        usedGB: Math.round((capacity - freeSpace) / 1073741824),
      }
    })

  // Datastore clusters with aggregated capacity
  const clusters: DatastoreListItem[] = podResults
    .filter((r) => r.props["name"])
    .map((r) => {
      const capacity = Number(r.props["summary.capacity"]) || 0
      const freeSpace = Number(r.props["summary.freeSpace"]) || 0
      return {
        moRef: r.moRef,
        name: r.props["name"],
        type: "Datastore Cluster",
        capacityGB: Math.round(capacity / 1073741824),
        usedGB: Math.round((capacity - freeSpace) / 1073741824),
      }
    })

  return [...clusters, ...datastores]
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
}

export async function checkDatastore(
  session: VsphereSession,
  name: string
): Promise<DatastoreInfo> {
  const [dsResults, podResults] = await Promise.all([
    retrieveProperties(session, {
      type: "Datastore",
      pathSet: ["name", "summary.capacity", "summary.freeSpace"],
      traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_DATASTORE],
    }),
    retrieveProperties(session, {
      type: "StoragePod",
      pathSet: ["name", "summary.capacity", "summary.freeSpace"],
      traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_DATASTORE],
    }),
  ])

  const match = [...dsResults, ...podResults].find((r) => r.props["name"] === name)
  if (!match) return { exists: false }

  const capacity = Number(match.props["summary.capacity"]) || 0
  const freeSpace = Number(match.props["summary.freeSpace"]) || 0
  return {
    exists: true,
    capacityGB: Math.round(capacity / 1073741824),
    usedGB: Math.round((capacity - freeSpace) / 1073741824),
  }
}

export async function listVmFolders(
  session: VsphereSession
): Promise<VmFolderTreeItem[]> {
  const results = await retrieveProperties(session, {
    type: "Folder",
    pathSet: ["name", "parent"],
    traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_VM],
  })

  // Build node map from Folder objects
  const nodeMap = new Map<string, { name: string; parentRef: string; children: string[] }>()
  for (const r of results) {
    if (r.type !== "Folder" || !r.props["name"]) continue
    nodeMap.set(r.moRef, {
      name: r.props["name"],
      parentRef: r.props["parent"] || "",
      children: [],
    })
  }

  // Build children lists from parent references
  for (const [moRef, node] of nodeMap) {
    if (node.parentRef && nodeMap.has(node.parentRef)) {
      nodeMap.get(node.parentRef)!.children.push(moRef)
    }
  }

  // Find roots: folders whose parent is not in our map (parent is a Datacenter).
  // Skip "vm" folders and promote their children as roots.
  const roots: string[] = []
  for (const [moRef, node] of nodeMap) {
    if (!node.parentRef || !nodeMap.has(node.parentRef)) {
      if (node.name === "vm") {
        roots.push(...node.children)
      } else {
        roots.push(moRef)
      }
    }
  }

  function buildTree(moRef: string): VmFolderTreeItem | null {
    const node = nodeMap.get(moRef)
    if (!node) return null
    const children = node.children
      .map((ref) => buildTree(ref))
      .filter((n): n is VmFolderTreeItem => n !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
    return { name: node.name, children }
  }

  return roots
    .map((ref) => buildTree(ref))
    .filter((n): n is VmFolderTreeItem => n !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function checkVmFolder(
  session: VsphereSession,
  name: string
): Promise<boolean> {
  const results = await retrieveProperties(session, {
    type: "Folder",
    pathSet: ["name"],
    traversals: [TRAVERSE_FOLDER, TRAVERSE_DC_VM],
  })
  return results.some((r) => r.props["name"] === name)
}
