import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { hasFirebaseAdmin, type Config } from '../config'
import type { Db } from '../db/pool'
import type { Realtime } from './context'

/** Firestore mirror and push delivery. Sign-in no longer depends on Firebase. */
export function createFirebaseServices(config: Config, db: Db): { realtime: Realtime | null } {
  if (!hasFirebaseAdmin(config)) {
    console.warn('Firebase Admin credentials are not set: the live change feed and push notifications are disabled.')
    return { realtime: null }
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: config.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })

  const firestore = getFirestore(app)
  const messaging = getMessaging(app)

  const realtime: Realtime = {
    // Minimal, disposable mirror. The authoritative record stays in PostgreSQL.
    async incidentChanged(e) {
      await firestore.collection('incident_events').doc(String(e.id)).set(e)
    },
    async push(userIds, payload) {
      if (!userIds.length) return
      const { rows } = await db.query<{ fcm_token: string }>('SELECT fcm_token FROM device_tokens WHERE user_id = ANY($1)', [userIds])
      const tokens = rows.map((r) => r.fcm_token)
      if (!tokens.length) return
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.incidentId ? { incidentId: String(payload.incidentId) } : {},
        webpush: { fcmOptions: { link: payload.incidentId ? `/incidents/${payload.incidentId}` : '/' } },
      })
      const dead = tokens.filter((_, i) => {
        const code = res.responses[i].error?.code
        return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token'
      })
      if (dead.length) await db.query('DELETE FROM device_tokens WHERE fcm_token = ANY($1)', [dead])
    },
  }
  return { realtime }
}
