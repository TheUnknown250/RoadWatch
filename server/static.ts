import express, { type Express } from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Serves the built React app (and its service workers) with an SPA fallback. API routes stay under /api. */
export function serveFrontend(app: Express, dir: string): boolean {
  if (!existsSync(path.join(dir, 'index.html'))) return false
  app.use(
    express.static(dir, {
      index: false,
      setHeaders(res, file) {
        const name = path.basename(file)
        // Workers and the app shell must always be revalidated; hashed assets can be cached for a year.
        const revalidate = name === 'sw.js' || name === 'firebase-messaging-sw.js' || name === 'manifest.webmanifest'
        res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : revalidate ? 'no-cache' : 'public, max-age=3600')
      },
    }),
  )
  app.get(/^\/(?!api(\/|$))(?!.*\.[a-z0-9]+$).*/i, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(dir, 'index.html'))
  })
  return true
}

export const PRODUCTION_CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'", 'https://www.gstatic.com', 'https://accounts.google.com/gsi/client'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
  'frame-src': ['https://accounts.google.com/gsi/'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
  'connect-src': [
    "'self'",
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    'https://fcmregistrations.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://www.googleapis.com',
    'https://accounts.google.com/gsi/',
    'https://fonts.googleapis.com',
    'https://tile.openstreetmap.org',
    'https://*.tile.openstreetmap.org',
  ],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  // Leave HTTPS upgrades to the reverse proxy so a plain-HTTP local run of a production build still works.
  'upgrade-insecure-requests': null,
}
