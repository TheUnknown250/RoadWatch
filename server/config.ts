import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgres://roadwatch:roadwatch_dev@127.0.0.1:5433/roadwatch'),
  // off: plain connection (local Docker). require: encrypted, certificate not checked (Supabase). verify: encrypted and certificate checked.
  DATABASE_SSL: z.enum(['off', 'require', 'verify']).default('off'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Reverse proxies in front of the API whose X-Forwarded-For entries are trusted. 1 for a host alone, 2 behind Vercel rewrites plus a host.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  // Firebase Admin credentials. Optional so the API can boot in development without them.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // Routing engine (OSRM-compatible). The public demo server is for development only; self-host for production.
  OSRM_URL: z.string().url().default('https://router.project-osrm.org'),
  // Set to true when your OSRM build supports `exclude=toll|motorway|ferry` (the public demo does not).
  OSRM_SUPPORTS_EXCLUDE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Place search and nearby services (Nominatim-compatible). Respect the provider's usage policy.
  NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  GEO_USER_AGENT: z.string().default('RoadWatch/1.0 (final year project)'),
  // Signs session tokens. Required in production (at least 32 random characters).
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters').or(z.literal('').transform(() => undefined)).optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // Google OAuth web client ID. When set, "Continue with Google" is offered on the sign-in page.
  GOOGLE_CLIENT_ID: z.string().trim().min(10).or(z.literal('').transform(() => undefined)).optional(),
  // Comma-separated emails that are promoted to admin on first sign-in.
  ADMIN_EMAILS: z.string().default(''),
  VERIFY_CONFIRM_THRESHOLD: z.coerce.number().int().min(1).default(3),
  VERIFY_FLAG_THRESHOLD: z.coerce.number().int().min(1).default(3),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid server configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.AUTH_SECRET) {
    throw new Error('Invalid server configuration: AUTH_SECRET is required in production')
  }
  return parsed.data
}

/** A fixed secret is used only outside production so local sessions survive restarts. */
export const DEV_AUTH_SECRET = 'roadwatch-local-development-secret-do-not-use-in-production'

export function hasFirebaseAdmin(c: Config): boolean {
  return Boolean(c.FIREBASE_PROJECT_ID && c.FIREBASE_CLIENT_EMAIL && c.FIREBASE_PRIVATE_KEY)
}
