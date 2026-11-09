import 'dotenv/config'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { router } from './router.js'
import { prisma } from './db.js'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { mcpHandler } from './mcp/tools.js'
import { MCP_PATH, METADATA_PATH, protectedResourceMetadata, requireMcpAuth } from './mcp/auth.js'

const app = express()

app.use(cors())
app.use(express.json())

// Unauthenticated diagnostic endpoint (before auth middleware)
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: 'failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
  }
})

// Claude connector (MCP). Own auth: answers 401 with OAuth discovery info instead of a plain error.
app.get(METADATA_PATH, protectedResourceMetadata)
app.get(/^\/\.well-known\/oauth-protected-resource(\/.*)?$/, protectedResourceMetadata)
const mcpNode = toNodeHandler(mcpHandler)
app.all(MCP_PATH, requireMcpAuth, (req, res) => void mcpNode(req, res, req.body))

app.use('/api', router)

// Global error handler — catches unhandled async errors in route handlers
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

// Only listen when running directly (not as Vercel serverless)
if (process.env.NODE_ENV !== 'production' || process.env.START_LOCAL) {
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

export default app
