import { createApp } from '../server/app'
import { loadConfig } from '../server/config'
import { createPool } from '../server/db/pool'
import { createFirebaseServices } from '../server/services/firebase'
import { noopRealtime } from '../server/services/context'
import { createGoogleVerifier, createTokenService } from '../server/services/localAuth'

const config = loadConfig()
const db = createPool(config.DATABASE_URL, config.DATABASE_SSL, 1)

const { realtime } = createFirebaseServices(config, db)
const tokens = createTokenService(config)

const app = createApp({
  config,
  db,
  verifier: tokens.verifier,
  realtime: realtime ?? noopRealtime,
  tokens,
  google: config.GOOGLE_CLIENT_ID
    ? createGoogleVerifier(config.GOOGLE_CLIENT_ID)
    : undefined,
})

export default app