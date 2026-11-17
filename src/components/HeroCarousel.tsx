import { ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { HERO_SLIDES, type HeroSlide } from '@/lib/heroSlides'

const AUTOPLAY_MS = 5000
const SWIPE_PX = 40
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const reducedMotionNow = () => window.matchMedia(REDUCED_MOTION).matches

function SlideBody({ slide, index, load }: { slide: HeroSlide; index: number; load: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-ink to-focus" aria-hidden />
      {load && !failed && <img src={slide.image} alt={slide.imageAlt} width={1600} height={900} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/55 to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 px-5 pb-11 text-left text-white md:px-8 md:pb-12">
        <p className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl md:text-5xl">{slide.title}</p>
        <p className="mt-1 text-sm font-normal text-white/90 md:text-lg">{slide.tagline}</p>
      </div>
    </>
  )
}

/** Auto-rotating image banner for the home screen. Slide content lives in `@/lib/heroSlides`. */
export function HeroCarousel() {
  const count = HERO_SLIDES.length
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false)
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [touch, setTouch] = useState(false)
  const swipeStart = useRef(0)
  const paused = hover || focus || touch

  const go = useCallback((to: number) => {
    const next = (to + count) % count
    setIndex(next)
    // Slides 2-7 only fetch their image once they are the next or current slide.
    setLoaded((prev) => (prev.has(next) && prev.has((next + 1) % count) ? prev : new Set(prev).add(next).add((next + 1) % count)))
  }, [count])

  useEffect(() => {
    if (reduced || paused) return
    const timer = window.setTimeout(() => go(index + 1), AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, reduced, go])

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse') return
    swipeStart.current = e.clientX
    setTouch(true)
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse') return
    const dx = e.clientX - swipeStart.current
    if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? index + 1 : index - 1)
    setTouch(false)
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="RoadWatch features"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setTouch(false)}
      className="relative aspect-[16/9] touch-pan-y select-none overflow-hidden rounded-3xl bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:aspect-[21/9]"
    >
      <h1 className="sr-only">RoadWatch. Know before you go.</h1>

      <div aria-live={paused || reduced ? 'polite' : 'off'}>
        {HERO_SLIDES.map((slide, i) => {
          const active = i === index
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={!active}
              className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              {slide.href ? (
                <Link to={slide.href} tabIndex={active ? 0 : -1} className="absolute inset-0 block focus-visible:outline-none">
                  <SlideBody slide={slide} index={i} load={loaded.has(i)} />
                </Link>
              ) : (
                <SlideBody slide={slide} index={i} load={loaded.has(i)} />
              )}
            </div>
          )
        })}
      </div>

      <Link to="/safety" className="absolute right-3 top-3 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-red-600 px-4 text-sm font-bold text-white shadow-lg"><ShieldAlert size={16} aria-hidden /> SOS</Link>

      <div className="absolute inset-x-0 bottom-1 z-10 flex justify-center">
        {HERO_SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}: ${slide.title}`}
            aria-current={i === index}
            className="grid size-8 place-items-center"
          >
            <span className={`block size-2 rounded-full transition-colors duration-300 motion-reduce:transition-none ${i === index ? 'bg-[#F04A3A]' : 'bg-[#0F9D8A]'}`} />
          </button>
        ))}
      </div>
    </section>
  )
}
