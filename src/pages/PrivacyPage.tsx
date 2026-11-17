const SECTIONS: [string, string[]][] = [
  ['What we collect', [
    'Account: your email address and display name, through Firebase Authentication.',
    'Content you create: incident reports (description, category, time, map coordinates), votes, comments and the areas you choose to follow.',
    'Your device location only when you tap a button that needs it, such as "Use my location". It is used for that action and is not tracked in the background.',
    'A push notification token for each device where you turn on alerts.',
  ]],
  ['What is public', [
    'Reports, comments and their coordinates are visible to everyone, together with your display name. Your email address is never shown.',
    'Votes are counted publicly but who voted how is not shown.',
  ]],
  ['How we use it', [
    'To show incidents, verify them with the community, send the alerts you asked for, and let moderators keep the service accurate.',
    'Aggregated, anonymous counts power the insights page.',
  ]],
  ['Your choices', [
    'You can withdraw an unverified report, remove your own comments, stop following an area and turn off push alerts at any time.',
    'You can delete your account from the Account page. This removes your email, followed areas, alerts and device tokens, and your sign-in. Reports and comments you already published stay on the map under the name "Deleted user" so that community verification is not lost.',
  ]],
  ['Rules of use', [
    'Only report incidents you saw or have reliable knowledge of. Do not post false reports, threats, hate speech, or personal details about private individuals.',
    'Moderators can reject reports, remove comments and suspend accounts that break these rules.',
    'RoadWatch is not an emergency service and reports may be wrong, late or incomplete. Use your own judgement and call 112 in an emergency.',
  ]],
]

export default function PrivacyPage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Privacy and terms</h1>
      <p role="note" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        This is a plain-language draft for the project. Before public launch, have it reviewed against Nigerian data protection law (including the Nigeria Data Protection Act 2023) and add the operator's legal name and contact details.
      </p>
      {SECTIONS.map(([h, items]) => (
        <section key={h} className="rounded-3xl border border-line bg-white/80 p-5">
          <h2 className="font-display text-base font-semibold">{h}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-soft">
            {items.map((i) => <li key={i} className="text-pretty">{i}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
