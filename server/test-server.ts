import { createServer, request as httpRequest } from "http"
import { request as httpsRequest } from "https"
import { readFileSync, createReadStream, statSync } from "fs"
import { join, extname } from "path"
import { handleVsphereTest, handleNsxTest, handleVsphereInventory, handleNsxInventory } from "./test-handlers.js"

const PORT = Number(process.env.PORT) || 80
const STATIC_DIR = join(import.meta.dirname, "../dist")

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

const indexHtml = readFileSync(join(STATIC_DIR, "index.html"))

const server = createServer((req, res) => {
  const url = req.url || "/"
  const method = req.method || "GET"

  // Apply security headers
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(k, v)
  }

  // /test/* routes
  if (url === "/test/vsphere/inventory") {
    handleVsphereInventory(req, res)
    return
  }
  if (url === "/test/nsx/inventory") {
    handleNsxInventory(req, res)
    return
  }
  if (url === "/test/vsphere") {
    handleVsphereTest(req, res)
    return
  }
  if (url === "/test/nsx") {
    handleNsxTest(req, res)
    return
  }

  // /api/* reverse proxy
  if (url.startsWith("/api/")) {
    const targetUrl = req.headers["x-target-url"] as string | undefined
    if (!targetUrl) {
      res.writeHead(502, { "Content-Type": "text/plain" })
      res.end("Missing X-Target-Url header")
      return
    }

    const stripped = url.replace(/^\/api/, "") || "/"
    const dest = new URL(stripped, targetUrl)
    const isHttps = dest.protocol === "https:"
    const reqFn = isHttps ? httpsRequest : httpRequest

    const headers: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: dest.host,
    }
    delete headers["x-target-url"]

    const proxyReq = reqFn(
      dest,
      {
        method,
        headers,
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" })
        res.end("Proxy error: " + err.message)
      }
    })

    req.pipe(proxyReq)
    return
  }

  // Static files
  if (method === "GET") {
    const filePath = join(STATIC_DIR, url === "/" ? "index.html" : url)

    // Only serve files within STATIC_DIR
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403)
      res.end()
      return
    }

    try {
      const stat = statSync(filePath)
      if (stat.isFile()) {
        const ext = extname(filePath)
        const contentType = MIME_TYPES[ext] || "application/octet-stream"

        // Cache immutable assets
        if (url.startsWith("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
        }

        // No cache for index.html
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
        }

        res.writeHead(200, { "Content-Type": contentType })
        createReadStream(filePath).pipe(res)
        return
      }
    } catch {
      // File doesn't exist — fall through to SPA fallback
    }

    // SPA fallback
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(indexHtml)
    return
  }

  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  console.log(`zpodweb server listening on port ${PORT}`)
})
