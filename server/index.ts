import { createApp } from './app'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { createPool } from './db/pool'
import { createFirebaseServices } from './services/firebase'
import { createGoogleVerifier, createTokenService } from './services/localAuth'
import { expireStale } from './services/incidents'
import { sweepOverdueTrips } from './services/safety'
import { noopRealtime } from './services/context'

const config = loadConfig()
const db = createPool(config.DATABASE_URL, config.DATABASE_SSL)
await migrate(db)

const { realtime } = createFirebaseServices(config, db)
if (!config.AUTH_SECRET) console.warn('AUTH_SECRET is not set: using the fixed development secret. Never run like this in production.')
if (!config.GOOGLE_CLIENT_ID) console.warn('GOOGLE_CLIENT_ID is not set: "Continue with Google" is hidden. Username and password sign-in still works.')
const tokens = createTokenService(config)
const app = createApp({
  config, db, verifier: tokens.verifier, realtime: realtime ?? noopRealtime, tokens,
  google: config.GOOGLE_CLIENT_ID ? createGoogleVerifier(config.GOOGLE_CLIENT_ID) : undefined,
})

const sweep = () =>
  expireStale({ db, config, realtime: realtime ?? noopRealtime }).catch((e) => console.error('expiry sweep failed:', e.message))
setInterval(sweep, 5 * 60_000)
const sweepTrips = () =>
  sweepOverdueTrips({ db, config, realtime: realtime ?? noopRealtime }).catch((e) => console.error('trip sweep failed:', e.message))
setInterval(sweepTrips, 60_000)

app.listen(config.PORT, () => console.log(`Road security API listening on :${config.PORT}`))
