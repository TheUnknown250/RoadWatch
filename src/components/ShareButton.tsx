import { Check, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { buildShareLink } from '@/lib/share'

/** Copies (or natively shares) a link to an in-app path. The link is built once on mount. */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void buildShareLink(path).then((l) => live && setLink(l))
    return () => {
      live = false
    }
  }, [path])

  async function share() {
    if (!link) return
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user closed the share sheet
      toast.error('Could not share. Copy the address from your browser instead.')
    }
  }

  return (
    <button type="button" onClick={() => void share()} disabled={!link} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line disabled:opacity-50">
      {copied ? <Check size={15} aria-hidden /> : <Share2 size={15} aria-hidden />} Share
    </button>
  )
}
