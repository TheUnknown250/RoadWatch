import { describe, expect, test } from 'bun:test'
import { isVotable, nextStatus } from '../services/status'

const t = { VERIFY_CONFIRM_THRESHOLD: 3, VERIFY_FLAG_THRESHOLD: 3 }

describe('nextStatus', () => {
  test('stays pending below thresholds', () => {
    expect(nextStatus('pending', 2, 0, t)).toBe('pending')
    expect(nextStatus('pending', 0, 2, t)).toBe('pending')
  })
  test('verifies at the confirm threshold', () => {
    expect(nextStatus('pending', 3, 0, t)).toBe('verified')
  })
  test('disputes at the flag threshold', () => {
    expect(nextStatus('pending', 0, 3, t)).toBe('disputed')
  })
  test('a tie does not verify or dispute', () => {
    expect(nextStatus('pending', 3, 3, t)).toBe('pending')
  })
  test('can flip when the balance changes', () => {
    expect(nextStatus('verified', 3, 4, t)).toBe('disputed')
  })
  test('never changes terminal or moderator-owned statuses', () => {
    for (const s of ['resolved', 'rejected', 'expired'] as const) expect(nextStatus(s, 9, 0, t)).toBe(s)
    expect(isVotable('resolved')).toBe(false)
    expect(isVotable('pending')).toBe(true)
  })
})
