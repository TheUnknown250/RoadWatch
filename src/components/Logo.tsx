import { useId } from 'react'

/** RoadWatch mark: a map pin holding a road that runs to the horizon. Decorative unless `title` is given. */
export function Logo({ size = 32, title }: { size?: number; title?: string }) {
  const clip = `rw-logo-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="shrink-0">
      <rect width="512" height="512" rx="112" fill="#13294B"/><g><path d="M256 420 L157.0 288.6 A124 124 0 1 1 355.0 288.6 Z" fill="#fff"/><circle cx="256" cy="214" r="98" fill="#E8A33D"/><circle cx="256" cy="214" r="92" fill="#13294B"/><clipPath id={clip}><circle cx="256" cy="214" r="92"/></clipPath><g clipPath={`url(#${clip})`}><path d="M249.0 150 L263.0 150 L331.7 320 L180.3 320Z" fill="#08132A"/><path d="M249 150 L180.3 320" stroke="#E8A33D" strokeWidth="6" fill="none"/><path d="M263 150 L331.7 320" stroke="#E8A33D" strokeWidth="6" fill="none"/><path d="M253.4 166 L258.6 166 L259.4 182 L252.6 182Z" fill="#fff"/><path d="M251.8 198 L260.2 198 L261.3 222 L250.7 222Z" fill="#fff"/><path d="M249.6 244 L262.4 244 L264.1 280 L247.9 280Z" fill="#fff"/></g></g>
    </svg>
  )
}
