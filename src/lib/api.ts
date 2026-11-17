export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message)
  }
  get isOffline() {
    return this.status === 0
  }
}

export const SESSION_EXPIRED_EVENT = 'roadwatch:session-expired'

type TokenGetter = () => Promise<string | null>
let getToken: TokenGetter = () => Promise.resolve(null)

export function setTokenGetter(fn: TokenGetter) {
  getToken = fn
}

interface Options {
  method?: string
  body?: unknown
  /** Send the signed-in user's token when available. Defaults to true. */
  auth?: boolean
  signal?: AbortSignal
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (opts.auth !== false) {
    const token = await getToken()
    if (token) headers.authorization = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'offline', 'You appear to be offline or the server is unreachable.')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON error pages (for example a proxy 502) fall through to the generic message below.
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: ApiError['details'] } } | null)?.error
    // A rejected session token (expired, revoked, account removed) signs the user out everywhere in the app.
    if (res.status === 401 && e?.code === 'unauthorized' && opts.auth !== false) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.details)
  }
  return data as T
}

/** A readable message for forms, including per-field validation details. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.length) return err.details.map((d) => `${d.path ? `${d.path}: ` : ''}${d.message}`).join('. ')
    return err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}
