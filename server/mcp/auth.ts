import type { Request, Response, NextFunction } from 'express'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { supabaseAdmin } from '../supabase.js'

// Claude connects to /api/mcp and signs in through Supabase's OAuth 2.1 server.
// Discovery: an unauthenticated call gets a 401 whose WWW-Authenticate header points
// at our protected-resource metadata, which names Supabase Auth as the authorization server.

export const MCP_PATH = '/api/mcp'
export const METADATA_PATH = '/api/mcp/oauth-protected-resource'

/** The public origin this request came in on (Vercel sets the forwarded headers). */
export function publicOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || req.protocol
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] || req.headers.host
  return `${proto}://${host}`
}

/** RFC 9728 protected resource metadata. `resource` must equal the URL entered in Claude. */
export function protectedResourceMetadata(req: Request, res: Response) {
  res.set('Cache-Control', 'public, max-age=300')
  res.json({
    resource: `${publicOrigin(req)}${MCP_PATH}`,
    // trim: the Vercel env value has carried a trailing newline, which breaks discovery
    authorization_servers: [`${(process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'OpenFit',
  })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

export interface McpCaller {
  userId: string
  token: string
  /** Base URL for calling this app's own REST API as the signed-in user */
  apiBase: string
}

/** Verifies the bearer token with Supabase and attaches it as `req.auth` for the MCP handler. */
export async function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const challenge = () => {
    res
      .status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${publicOrigin(req)}${METADATA_PATH}"`)
      .json({ error: 'invalid_token', error_description: 'Sign in to OpenFit to use this connector' })
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return challenge()
  const token = header.slice(7)

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return challenge()

  const claims = decodeJwtPayload(token)
  const caller: McpCaller = { userId: user.id, token, apiBase: publicOrigin(req) }
  const auth: AuthInfo = {
    token,
    clientId: typeof claims.client_id === 'string' ? claims.client_id : 'openfit',
    scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
    expiresAt: typeof claims.exp === 'number' ? claims.exp : Math.floor(Date.now() / 1000) + 300,
    extra: { caller },
  }
  ;(req as Request & { auth?: AuthInfo }).auth = auth
  next()
}
