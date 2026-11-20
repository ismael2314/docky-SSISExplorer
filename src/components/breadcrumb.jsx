import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'

// trail: [{ label, to, trail }]  - each item remembers the trail to restore when you go back to it.
export function Breadcrumb({ trail = [], current, actions }) {
  const last = trail[trail.length - 1]
  return (
    <nav className="flex min-h-14 flex-wrap items-center gap-1.5 border-b bg-background px-6 py-2.5 text-sm">
      {last && (
        <>
          <Link to={last.to} state={{ trail: last.trail }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-medium hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="mx-1.5 h-5 w-px bg-border" />
        </>
      )}
      {trail.map((t, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <Link to={t.to} state={{ trail: t.trail }} className="text-muted-foreground hover:text-foreground hover:underline">
            {t.label}
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        </span>
      ))}
      <span className="text-base font-semibold tracking-tight">{current}</span>
      {actions && <div className="ml-auto">{actions}</div>}
    </nav>
  )
}
