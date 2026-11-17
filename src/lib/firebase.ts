import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
}

export const vapidKey = env.VITE_FIREBASE_VAPID_KEY as string | undefined

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

export function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('Firebase is not configured')
  return getApps().length ? getApp() : initializeApp(firebaseConfig)
}
