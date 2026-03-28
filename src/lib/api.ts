import { supabase } from './supabase'

const BASE_URL = '/api'

export class ApiError extends Error {
  status: number
  data: Record<string, unknown>

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  // Attach Supabase auth token if available
  const { data: { session } } = await supabase.auth.getSession()
  const authHeader = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
