import { request as httpsRequest } from "https"
import { highlight } from "cli-highlight"

// ─── NSX debug logging ──────────────────────────────────────────────────────

const debugEnabled = process.env.DEBUG_API_NSX === "true"

// ─── REST transport ─────────────────────────────────────────────────────────

interface RestResponse {
  status: number
  body: string
}

function restGet(
  host: string,
  path: string,
  username: string,
  password: string
): Promise<RestResponse> {
  if (debugEnabled) {
    console.log(highlight(`\n// NSX GET ${path} → ${host}`, { language: "javascript" }))
  }

  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${username}:${password}`).toString("base64")
    const req = httpsRequest(
      {
        hostname: host,
        port: 443,
        path,
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString()

          if (debugEnabled) {
            console.log(highlight(`// NSX GET ${path} ← ${res.statusCode}`, { language: "javascript" }))
            try {
              console.log(highlight(JSON.stringify(JSON.parse(responseBody), null, 2), { language: "json" }))
            } catch {
              console.log(responseBody)
            }
          }

          resolve({
            status: res.statusCode || 500,
            body: responseBody,
          })
        })
        res.on("error", reject)
      }
    )
    req.on("error", reject)
    req.end()
  })
}

export interface NsxSession {
  host: string
  username: string
  password: string
  version: string
}

export async function connect(
  host: string,
  username: string,
  password: string
): Promise<NsxSession> {
  const res = await restGet(host, "/api/v1/node", username, password)
  if (res.status === 401 || res.status === 403) {
    throw new Error("Invalid credentials")
  }
  if (res.status !== 200) {
    throw new Error("Unable to connect")
  }
  const data = JSON.parse(res.body)
  return {
    host,
    username,
    password,
    version: data.product_version || data.node_version || "unknown",
  }
}

export async function listTransportZones(
  session: NsxSession
): Promise<string[]> {
  const res = await restGet(session.host, "/api/v1/transport-zones", session.username, session.password)
  if (res.status !== 200) return []
  const data = JSON.parse(res.body)
  return (data.results || [])
    .filter((r: { transport_type: string }) => r.transport_type === "OVERLAY")
    .map((r: { display_name: string }) => r.display_name)
    .sort()
}

export async function listEdgeClusters(
  session: NsxSession
): Promise<string[]> {
  const res = await restGet(session.host, "/api/v1/edge-clusters", session.username, session.password)
  if (res.status !== 200) return []
  const data = JSON.parse(res.body)
  return (data.results || []).map((r: { display_name: string }) => r.display_name).sort()
}

export async function listT0Gateways(
  session: NsxSession
): Promise<string[]> {
  const res = await restGet(session.host, "/policy/api/v1/infra/tier-0s", session.username, session.password)
  if (res.status !== 200) return []
  const data = JSON.parse(res.body)
  return (data.results || []).map((r: { display_name: string }) => r.display_name).sort()
}

export async function checkEdgeCluster(
  session: NsxSession,
  name: string
): Promise<boolean> {
  const res = await restGet(
    session.host,
    "/api/v1/edge-clusters",
    session.username,
    session.password
  )
  if (res.status !== 200) return false
  const data = JSON.parse(res.body)
  const results = data.results || []
  return results.some(
    (r: { display_name: string }) => r.display_name === name
  )
}

export async function checkT0(
  session: NsxSession,
  name: string
): Promise<boolean> {
  const res = await restGet(
    session.host,
    "/policy/api/v1/infra/tier-0s",
    session.username,
    session.password
  )
  if (res.status !== 200) return false
  const data = JSON.parse(res.body)
  const results = data.results || []
  return results.some(
    (r: { display_name: string }) => r.display_name === name
  )
}

export async function checkTransportZone(
  session: NsxSession,
  name: string
): Promise<boolean> {
  const res = await restGet(
    session.host,
    "/api/v1/transport-zones",
    session.username,
    session.password
  )
  if (res.status !== 200) return false
  const data = JSON.parse(res.body)
  const results = data.results || []
  return results.some(
    (r: { display_name: string }) => r.display_name === name
  )
}
