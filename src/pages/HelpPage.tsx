import { LifeBuoy, PhoneCall } from 'lucide-react'
import { Link } from 'react-router-dom'

const TIPS = [
  'Never report while driving. Ask a passenger, or stop in a safe place first.',
  'Do not confront suspects or approach an incident to take a better look.',
  'Describe what happened, where and when. Leave out names, plate numbers and phone numbers of private people.',
  'Check the map before long trips and follow the states you travel through for alerts.',
  'Plan to arrive before dark where reports of robbery or checkpoint extortion are frequent.',
]

const FAQ = [
  ['How are reports checked?', 'Other road users confirm or flag each report. With a few independent confirmations (three by default) a report is marked verified. If more people flag it than confirm it, it is marked disputed. Moderators review reports and can override the community.'],
  ['Why can I not vote on my own report?', 'Verification only works if it comes from other people. You can add updates in the comments instead.'],
  ['Can I change my vote?', 'No. One vote per person per report keeps the count honest.'],
  ['How long does a report stay on the map?', 'Each category has a lifetime, from about half a day for traffic hazards to a week for bad roads. After that it expires but remains in the statistics.'],
  ['What if I made a mistake?', 'While nobody has verified your report you can withdraw it from its page. Otherwise add a comment or ask a moderator by flagging it.'],
  ['Can I use RoadWatch without internet?', 'Yes, partly. The app shows saved information with a notice saying how old it is, and reports you write offline are sent when you reconnect. Voting and comments need a connection.'],
  ['Who sees my reports?', 'Reports and comments are public and show your display name, not your email. See the privacy page for details.'],
]

export default function HelpPage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Help and safety</h1>

      <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-900" aria-labelledby="emergency-h">
        <h2 id="emergency-h" className="flex items-center gap-2 font-display text-lg font-semibold"><PhoneCall size={20} aria-hidden /> In an emergency</h2>
        <p className="mt-1 text-pretty">Call <a href="tel:112" className="font-bold underline">112</a>, Nigeria's national emergency number, before anything else. RoadWatch is a community information tool. It does not dispatch help and reports are not read by emergency services.</p>
      </section>

      <section aria-labelledby="tips-h" className="rounded-3xl border border-line bg-white/80 p-5">
        <h2 id="tips-h" className="flex items-center gap-2 font-display text-base font-semibold"><LifeBuoy size={18} aria-hidden /> Staying safe</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          {TIPS.map((t) => <li key={t} className="text-pretty">{t}</li>)}
        </ul>
      </section>

      <section aria-labelledby="faq-h" className="space-y-2">
        <h2 id="faq-h" className="font-display text-base font-semibold">Common questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="rounded-2xl border border-line bg-white/80 p-4">
            <summary className="min-h-6 cursor-pointer text-sm font-semibold">{q}</summary>
            <p className="mt-2 text-pretty text-sm text-ink-soft">{a}</p>
          </details>
        ))}
      </section>

      <p className="text-center text-sm text-ink-soft">
        <Link to="/privacy" className="font-semibold text-focus underline">Privacy and terms</Link>
      </p>
    </div>
  )
}
