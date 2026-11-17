export interface HeroSlide {
  id: string
  title: string
  tagline: string
  /** Path under public/. The ?v= suffix busts browser caches: bump it whenever you replace an image file. */
  image: string
  imageAlt: string
  /** Optional route the whole slide links to. Leave out to make the slide non-clickable. */
  href?: string
}

/** Edit the copy, images and links of the home hero here. Order is display order. */
export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'communities',
    title: 'COMMUNITIES',
    tagline: 'Safety in numbers',
    image: '/hero/communities.svg?v=2',
    imageAlt: 'A collage of six community groups: an estate, a school, a mosque, an office, NGO volunteers and a town hall meeting',
    href: '/communities',
  },
  {
    id: 'real-time',
    title: 'RiskTrack: In Real Time',
    tagline: 'Stay Safe · Report Fast · Protect All',
    image: '/hero/real-time.svg?v=2',
    imageAlt: 'Aerial view of Abuja with its domed landmark, roads and green hills',
    href: '/map',
  },
  {
    id: 'sos',
    title: 'SOS',
    tagline: 'One tap. Instant response',
    image: '/hero/sos.svg?v=2',
    imageAlt: 'A woman holding a glowing phone on a rainy Lagos street at dusk',
    href: '/safety',
  },
  {
    id: 'emergency-call',
    title: 'EMERGENCY CALL',
    tagline: 'Help arrives faster',
    image: '/hero/emergency-call.svg?v=2',
    imageAlt: 'A hospital entrance with an ambulance, a police car and a fire truck outside',
    href: '/directory',
  },
  {
    id: 'safety-monitor',
    title: 'SAFETY MONITOR',
    tagline: "We've got your back",
    image: '/hero/safety-monitor.svg?v=2',
    imageAlt: 'A passenger in a Lagos danfo bus on the left and a man checking his phone in a market on the right, with a message reading: Check-in received from Ada. All good.',
    href: '/safety',
  },
  {
    id: 'eye-report',
    title: 'EYE REPORT',
    tagline: 'See something? Say something',
    image: '/hero/eye-report.svg?v=2',
    imageAlt: 'The Lagos skyline behind a highway interchange at sunset',
    href: '/report',
  },
  {
    id: 'safety-scan',
    title: 'SAFETY SCAN',
    tagline: 'Check before you step in',
    image: '/hero/safety-scan.svg?v=2',
    imageAlt: 'A phone showing a safety score in front of a gated estate',
    href: '/scan',
  },
]
