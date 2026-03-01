import path from "path"
import { defineConfig, loadEnv } from 'vite'
import type { ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { request as httpRequest } from "http"
import { request as httpsRequest } from "https"
import type { IncomingMessage, ServerResponse } from "http"
import { inspect } from "util"

// ANSI color helpers
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
}

function statusColor(code: number): string {
  if (code < 300) return c.green
  if (code < 400) return c.yellow
  return c.red
}

function methodColor(method: string): string {
  switch (method) {
    case "GET": return c.cyan
    case "POST": return c.green
    case "PUT": case "PATCH": return c.yellow
    case "DELETE": return c.red
    default: return c.magenta
  }
}

function colorizeJson(obj: unknown): string {
  return inspect(obj, { colors: true, depth: 6, maxArrayLength: 20, breakLength: 100 })
}

function collectBodyRaw(stream: IncomingMessage | NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", () => resolve(Buffer.alloc(0)))
  })
}

function apiProxyPlugin() {
  return {
    name: "api-proxy",
    configureServer(server: ViteDevServer) {
      // Test routes for endpoint connectivity validation (same Node.js process)
      server.middlewares.use("/test/vsphere/inventory", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleVsphereInventory } = await import("./server/test-handlers.js")
        handleVsphereInventory(req, res)
      })
      server.middlewares.use("/test/nsx/inventory", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleNsxInventory } = await import("./server/test-handlers.js")
        handleNsxInventory(req, res)
      })
      server.middlewares.use("/test/vsphere", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleVsphereTest } = await import("./server/test-handlers.js")
        handleVsphereTest(req, res)
      })
      server.middlewares.use("/test/nsx", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleNsxTest } = await import("./server/test-handlers.js")
        handleNsxTest(req, res)
      })

      // Dynamic reverse proxy replicating Nginx /api/ behavior for local dev.
      // Routes each request to the zpodapi URL from the X-Target-Url header.
      server.middlewares.use("/api", (req: IncomingMessage, res: ServerResponse) => {
        const start = Date.now()
        const method = req.method || "GET"
        const targetUrl = req.headers["x-target-url"] as string | undefined
        if (!targetUrl) {
          res.writeHead(502, { "Content-Type": "text/plain" })
          res.end("Missing X-Target-Url header")
          return
        }

        const stripped = (req.url || "").replace(/^\/api/, "") || "/"
        const dest = new URL(stripped, targetUrl)
        const isHttps = dest.protocol === "https:"
        const reqFn = isHttps ? httpsRequest : httpRequest

        const headers: Record<string, string | string[] | undefined> = { ...req.headers, host: dest.host }
        delete headers["x-target-url"]

        // Collect request body as raw Buffer to preserve binary data (multipart uploads)
        collectBodyRaw(req).then((reqBody) => {
          const reqContentType = (req.headers["content-type"] || "")
          const isMultipart = reqContentType.includes("multipart")

          const proxyReq = reqFn(
            dest,
            { method, headers },
            (proxyRes) => {
              const status = proxyRes.statusCode || 502
              const contentType = proxyRes.headers["content-type"] || ""
              const isJson = contentType.includes("json")

              // Collect response body for logging, then forward
              const resChunks: Buffer[] = []
              proxyRes.on("data", (chunk: Buffer) => {
                resChunks.push(chunk)
                res.write(chunk)
              })
              proxyRes.on("end", () => {
                res.end()
                const ms = Date.now() - start

                // Log request line
                const mc = methodColor(method)
                const sc = statusColor(status)
                console.log(
                  `${c.gray}${new Date().toISOString().replace("T", " ").slice(0, 19)}${c.reset} ${c.dim}${(req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "?").replace("::ffff:", "")}${c.reset} ${mc}${c.bold}${method}${c.reset} ${c.blue}${dest.pathname}${c.reset} ${sc}${status}${c.reset} ${c.gray}${ms}ms${c.reset}`
                )

                // Log payloads for mutating requests only
                if (method !== "GET") {
                  if (reqBody.length > 0) {
                    if (isMultipart) {
                      console.log(`  ${c.dim}→ req${c.reset}  ${c.gray}[multipart ${reqBody.length} bytes]${c.reset}`)
                    } else {
                      const reqStr = reqBody.toString()
                      try {
                        const parsed = JSON.parse(reqStr)
                        console.log(`  ${c.dim}→ req${c.reset}  ${colorizeJson(parsed)}`)
                      } catch {
                        console.log(`  ${c.dim}→ req${c.reset}  ${reqStr.slice(0, 200)}`)
                      }
                    }
                  }

                  if (isJson && resChunks.length > 0) {
                    const resBody = Buffer.concat(resChunks).toString()
                    try {
                      const parsed = JSON.parse(resBody)
                      console.log(`  ${c.dim}← res${c.reset}  ${colorizeJson(parsed)}`)
                    } catch {
                      console.log(`  ${c.dim}← res${c.reset}  ${resBody.slice(0, 500)}`)
                    }
                  }
                }
              })

              res.writeHead(status, proxyRes.headers)
            },
          )

          proxyReq.on("error", (err) => {
            const ms = Date.now() - start
            console.log(
              `\n${c.dim}───${c.reset} ${methodColor(method)}${c.bold}${method}${c.reset} ${c.blue}${dest.pathname}${c.reset} ${c.red}ERR${c.reset} ${c.gray}${ms}ms${c.reset}`
            )
            console.log(`  ${c.red}✗ ${err.message}${c.reset}`)
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "text/plain" })
              res.end("Proxy error: " + err.message)
            }
          })

          proxyReq.write(reqBody)
          proxyReq.end()
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "ZPODWEB_")
  // Load DEBUG_API_* vars into process.env for server-side SOAP logging
  const debugEnv = loadEnv(mode, process.cwd(), "DEBUG_API_")
  for (const [key, value] of Object.entries(debugEnv)) {
    process.env[key] = value
  }
  return {
    plugins: [react(), apiProxyPlugin()],
    envPrefix: "ZPODWEB_",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: true,
      port: Number(env.ZPODWEB_DEFAULT_UI_PORT) || 8500,
    },
  }
})
