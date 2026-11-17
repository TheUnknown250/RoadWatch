export type IncidentStatus = 'pending' | 'verified' | 'disputed' | 'resolved' | 'rejected' | 'expired' | 'withdrawn'
export type Role = 'user' | 'moderator' | 'admin'

export interface Incident {
  id: number
  title: string
  description: string
  addressText: string | null
  state: string | null
  status: IncidentStatus
  occurredAt: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  confirmCount: number
  flagCount: number
  latitude: number
  longitude: number
  category: { slug: string; name: string; severity: number }
  reporter: { id: number; displayName: string }
  isAnonymous: boolean
  myVote: 'confirm' | 'flag' | null
  distanceM?: number
}

export interface StatusHistoryEntry {
  from: string | null
  to: string
  reason: string | null
  at: string
  by: string | null
}

export interface Category {
  slug: string
  name: string
  severity: number
}

export interface Me {
  id: number
  email: string | null
  displayName: string
  role: Role
  reputation: number
  createdAt: string
  /** False for accounts that sign in with Google only. */
  hasPassword: boolean
}

export interface AppNotification {
  id: number
  incidentId: number | null
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export interface Subscription {
  id: number
  latitude: number
  longitude: number
  radiusKm: number
  label: string | null
  categoryIds: number[]
}

export interface NewReport {
  categorySlug: string
  title: string
  description: string
  latitude: number
  longitude: number
  addressText?: string
  state?: string
  occurredAt: string
  idempotencyKey: string
  isAnonymous?: boolean
}

export interface IncidentFilters {
  q: string
  categories: string[]
  statuses: IncidentStatus[]
  from: string
  to: string
  near?: { lat: number; lng: number; radiusKm: number }
}

export const EMPTY_FILTERS: IncidentFilters = { q: '', categories: [], statuses: [], from: '', to: '' }

export interface Comment {
  id: number
  body: string
  createdAt: string
  hidden: boolean
  mine: boolean
  author: { id: number; displayName: string; role: Role }
}

export interface Advisory {
  id: number
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  state: string | null
  createdAt: string
  expiresAt: string
}

export interface InsightsSummary {
  days: number
  total: number
  verified: number
  open: number
  byCategory: { slug: string; name: string; severity: number; n: number }[]
  byState: { state: string; n: number }[]
  trend: { day: string; n: number }[]
  serverTime: string
}

export interface Hotspot {
  latitude: number
  longitude: number
  count: number
  score: number
  topCategory: string
}

export type ScanLevel = 'safe' | 'caution' | 'elevated' | 'danger'
export type Confidence = 'none' | 'low' | 'medium' | 'high'

export interface SafetyScan {
  score: number
  level: ScanLevel
  confidence: Confidence
  radiusKm: number
  days: number
  total: number
  threats: { slug: string; name: string; n: number; advice: string }[]
  advice: string[]
  recent: { id: number; title: string; status: IncidentStatus; category: string; occurredAt: string }[]
  method: string
  serverTime: string
}

export type RouteTag = 'fastest' | 'safest' | 'recommended'

export interface RouteIncident {
  id: number
  title: string
  category: string
  slug: string
  status: IncidentStatus
  latitude: number
  longitude: number
  distanceM: number
  risk: number
}

export interface PlannedRoute {
  id: string
  distanceM: number
  durationS: number
  coordinates: [number, number][]
  risk: number
  safetyScore: number
  level: ScanLevel
  incidents: RouteIncident[]
  effectiveMinutes: number
  tags: RouteTag[]
}

export interface RoutePlan {
  routes: PlannedRoute[]
  recommendedId: string
  appliedPreferences: string[]
  ignoredPreferences: string[]
  provider: string
  trafficAware: boolean
}

export interface LatLng {
  lat: number
  lng: number
}

export interface PlaceResult extends LatLng {
  label: string
  type: string
  phone?: string
}

export interface UserSettings {
  tripSuggestions: boolean
  avoidTolls: boolean
  avoidMotorways: boolean
  avoidFerries: boolean
  preferSafest: boolean
  shareSosWithCommunities: boolean
}

export interface SavedPlace {
  id: number
  label: string
  kind: 'home' | 'work' | 'school' | 'other'
  addressText: string | null
  typicalDays: number[]
  arriveBy: string | null
  latitude: number
  longitude: number
}

export interface TripSuggestion {
  id: string
  kind: 'scheduled' | 'habit'
  label: string
  reason: string
  destination: LatLng
  arriveBy: string | null
  leaveAt: string | null
  leaveNow: boolean
  etaMinutes: number | null
  distanceM: number | null
  safetyScore: number | null
  level: ScanLevel | null
  warnings: string[]
  routeError: string | null
}

export type CommunityType = 'family' | 'neighborhood' | 'workplace' | 'school' | 'other'
export type CommunityRole = 'owner' | 'admin' | 'member'

export interface Community {
  id: number
  name: string
  type: CommunityType
  description: string | null
  memberCount: number
  myRole: CommunityRole
  inviteCode: string | null
  createdAt: string
}

export interface CommunityMember {
  id: number
  displayName: string
  role: CommunityRole
  joinedAt: string
}

export interface CommunityPost {
  id: number
  kind: 'alert' | 'message'
  body: string
  createdAt: string
  author: { id: number; displayName: string }
  mine: boolean
  latitude: number | null
  longitude: number | null
}

export interface SafetySession {
  id: number
  kind: 'sos' | 'trip'
  status: 'active' | 'overdue' | 'ended'
  outcome: 'arrived' | 'safe' | 'cancelled' | null
  message: string | null
  owner: { id: number; displayName: string }
  destination: { lat: number; lng: number; label: string | null } | null
  expectedArrival: string | null
  graceMinutes: number
  lastLocation: LatLng | null
  lastSeen: string
  startedAt: string
  endedAt: string | null
  communities: { id: number; name: string }[]
  mine: boolean
}

export interface DirectoryContact {
  id: number
  name: string
  kind: string
  phone: string
  state: string | null
  description: string | null
  sourceUrl: string | null
  verified: boolean
}

export interface NearbyService extends PlaceResult {
  kind: 'hospital' | 'police' | 'fire'
  distanceM: number
}
