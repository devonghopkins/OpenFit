import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../supabase.js'
import { ensureUserSetup } from '../services/user-setup.js'

export interface AuthRequest extends Request {
  userId: string
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' })
    return
  }

  const token = authHeader.slice(7)

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  ;(req as AuthRequest).userId = user.id

  // Provision default data for new users (no-op if already set up)
  await ensureUserSetup(user.id)

  next()
}
