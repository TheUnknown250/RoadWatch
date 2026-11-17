import L from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { SEVERITY_COLOR } from '@/lib/format'
import type { Hotspot, Incident } from '@/lib/types'
import { StatusBadge } from './StatusBadge'

// Bundlers rewrite asset URLs, so Leaflet's default marker images must be wired up explicitly.
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

export const NIGERIA_CENTER: [number, number] = [9.082, 8.6753]

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export interface MapRoute {
  id: string
  coordinates: [number, number][] // [lng, lat]
  color: string
  selected: boolean
}

export interface MapHazard {
  id: number
  lat: number
  lng: number
  title: string
  color: string
}

export interface MapSpot {
  id: string
  lat: number
  lng: number
  label: string
  tone: 'origin' | 'destination' | 'person' | 'sos'
}

const SPOT_STYLE = {
  origin: { bg: '#0F1B33', text: 'A' },
  destination: { bg: '#0F1B33', text: 'B' },
  person: { bg: '#3B5B8C', text: '' },
  sos: { bg: '#B91C1C', text: 'SOS' },
}

function spotIcon(tone: MapSpot['tone']): L.DivIcon {
  const s = SPOT_STYLE[tone]
  const w = tone === 'sos' ? 40 : 28
  return L.divIcon({
    className: '',
    iconSize: [w, 28],
    iconAnchor: [w / 2, 14],
    html: `<div class="pin" style="width:${w}px;height:28px;background:${s.bg};color:#fff;display:grid;place-items:center;font:700 12px 'DM Sans',sans-serif">${s.text}</div>`,
  })
}

function pinIcon(i: Incident): L.DivIcon {
  const size = i.status === 'verified' ? 26 : 22
  const dim = i.status === 'disputed' || i.status === 'resolved' || i.status === 'expired' ? 0.55 : 1
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="pin" style="width:${size}px;height:${size}px;background:${SEVERITY_COLOR[i.category.severity]};opacity:${dim}"></div>`,
  })
}

function FitTo({ points }: { points: [number, number][] }) {
  const map = useMap()
  // Refit only when the set of locations changes, not on every count or status update.
  const key = points.map((p) => `${p[0]},${p[1]}`).join(';')
  useEffect(() => {
    if (!key) return
    const pts = key.split(';').map((p) => p.split(',').map(Number) as [number, number])
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 })
  }, [key, map])
  return null
}

function PanToPin({ pinned }: { pinned: [number, number] | null | undefined }) {
  const map = useMap()
  const lat = pinned?.[0]
  const lng = pinned?.[1]
  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    map.setView([lat, lng], Math.max(map.getZoom(), 12))
  }, [lat, lng, map])
  return null
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

interface Props {
  incidents: Incident[]
  className?: string
  /** Called when the empty map is tapped (used by location pickers). */
  onPick?: (lat: number, lng: number) => void
  pinned?: [number, number] | null
  fit?: boolean
  /** Areas with several recent reports, drawn as translucent circles. */
  hotspots?: Hotspot[]
  routes?: MapRoute[]
  onSelectRoute?: (id: string) => void
  hazards?: MapHazard[]
  spots?: MapSpot[]
}

export function IncidentMap({ incidents, className, onPick, pinned, fit = true, hotspots, routes, onSelectRoute, hazards, spots }: Props) {
  const icons = useMemo(() => new Map(incidents.map((i) => [i.id, pinIcon(i)])), [incidents])
  const points: [number, number][] = [
    ...incidents.map((i) => [i.latitude, i.longitude] as [number, number]),
    ...(routes ?? []).flatMap((r) => r.coordinates.filter((_, idx) => idx % 8 === 0).map(([lng, lat]) => [lat, lng] as [number, number])),
    ...(spots ?? []).map((s) => [s.lat, s.lng] as [number, number]),
  ]
  return (
    <MapContainer center={pinned ?? NIGERIA_CENTER} zoom={pinned ? 14 : 6} className={className} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {fit && <FitTo points={points} />}
      {onPick && <ClickHandler onPick={onPick} />}
      <PanToPin pinned={pinned} />
      {routes
        ?.slice()
        .sort((a, b) => Number(a.selected) - Number(b.selected))
        .map((r) => (
          <Polyline
            key={r.id}
            positions={r.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: r.color, weight: r.selected ? 7 : 4, opacity: r.selected ? 0.95 : 0.55 }}
            eventHandlers={onSelectRoute ? { click: () => onSelectRoute(r.id) } : undefined}
          />
        ))}
      {hazards?.map((h) => (
        <CircleMarker key={h.id} center={[h.lat, h.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: h.color, fillOpacity: 1 }}>
          <Popup><p className="font-semibold">{h.title}</p><Link to={`/incidents/${h.id}`} className="text-sm font-semibold text-focus underline">View details</Link></Popup>
        </CircleMarker>
      ))}
      {hotspots?.map((h) => (
        <Circle
          key={`${h.latitude},${h.longitude}`}
          center={[h.latitude, h.longitude]}
          radius={2500 + Math.min(h.count, 10) * 300}
          pathOptions={{ color: '#B91C1C', weight: 1, fillColor: '#B91C1C', fillOpacity: Math.min(0.12 + h.count * 0.04, 0.4) }}
        >
          <Popup>
            <p className="font-semibold">{h.count} reports in this area</p>
            <p className="text-sm">Most serious: {h.topCategory}</p>
          </Popup>
        </Circle>
      ))}
      {pinned && <Marker position={pinned} />}
      {spots?.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={spotIcon(s.tone)}>
          <Popup>{s.label}</Popup>
        </Marker>
      ))}
      {incidents.map((i) => (
        <Marker key={i.id} position={[i.latitude, i.longitude]} icon={icons.get(i.id)} keyboard>
          <Popup>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{i.category.name}</p>
              <p className="font-semibold text-ink">{i.title}</p>
              <StatusBadge status={i.status} />
              <div>
                <Link to={`/incidents/${i.id}`} className="text-sm font-semibold text-focus underline">
                  View details
                </Link>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
