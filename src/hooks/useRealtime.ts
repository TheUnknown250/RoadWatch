import { useQueryClient } from '@tanstack/react-query'
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { firebaseApp, firebaseConfigured } from '@/lib/firebase'

export type RealtimeState = 'live' | 'polling'

/**
 * Subscribes to the Firestore `incident_events` mirror. Events only say "something changed";
 * the real data is always re-fetched from the API (PostgreSQL stays the source of truth).
 * Without Firestore, or if it errors, the incident list falls back to polling.
 */
export function useRealtime(): RealtimeState {
  const qc = useQueryClient()
  const [state, setState] = useState<RealtimeState>('polling')

  useEffect(() => {
    if (!firebaseConfigured) return
    const q = query(collection(getFirestore(firebaseApp()), 'incident_events'), orderBy('updatedAt', 'desc'), limit(25))
    let first = true
    return onSnapshot(
      q,
      (snap) => {
        setState('live')
        if (first) {
          first = false // the initial snapshot is existing data, not a change
          return
        }
        const changes = snap.docChanges()
        changes.forEach((c) => void qc.invalidateQueries({ queryKey: ['incident', Number(c.doc.id)] }))
        if (changes.length) {
          void qc.invalidateQueries({ queryKey: ['incidents'] })
          void qc.invalidateQueries({ queryKey: ['notifications'] })
        }
      },
      () => setState('polling'),
    )
  }, [qc])

  return state
}
