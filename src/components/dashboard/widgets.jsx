import { Link } from 'react-router-dom'

export { Card } from '@/components/page'

// Stat tile: label and icon on top, big number, short caption underneath (it wraps instead of being cut off).
export function Kpi({ icon: Icon, kind = 'task', label, value, sub, to, alert }) {
  const chip = alert ? 'tone tone-error' : `kind-chip kind-${kind === 'task' ? 'other' : kind}`
  const body = (
    <div className={`flex h-full flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition ${to ? 'hover:border-foreground/25 hover:shadow' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`${chip} flex h-8 w-8 items-center justify-center rounded-lg`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</div>
        {sub && <div className={`mt-1.5 text-xs ${alert ? 'text-warn font-medium' : 'text-muted-foreground'}`}>{sub}</div>}
      </div>
    </div>
  )
  return to ? <Link to={to} className="block h-full">{body}</Link> : body
}

// Horizontal bars: [{ label, value, color }]  (color may be a CSS variable such as var(--kind-sql))
export function BarList({ items }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-3.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="font-medium">{i.label}</span>
            <span className="tabular-nums text-muted-foreground">{i.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Donut chart: segments = [{ label, value, color }]. The circle has circumference 100, so values map to percentages.
export function Donut({ segments, centerLabel }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let offset = 0
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <svg viewBox="0 0 42 42" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Breakdown">
        <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="5" style={{ stroke: 'var(--muted)' }} />
        {segments.map((s) => {
          const pct = (s.value / total) * 100
          const el = (
            <circle
              key={s.label}
              cx="21" cy="21" r="15.9155" fill="none" strokeWidth="5"
              strokeDasharray={`${Math.max(pct - 0.6, 0.1)} ${100 - Math.max(pct - 0.6, 0.1)}`}
              strokeDashoffset={-offset}
              style={{ stroke: s.color }}
            />
          )
          offset += pct
          return el
        })}
        <g className="origin-center rotate-90">
          <text x="21" y="22.5" textAnchor="middle" fontSize="7.5" fontWeight="600" style={{ fill: 'var(--foreground)' }}>{total}</text>
          {centerLabel && <text x="21" y="27.5" textAnchor="middle" fontSize="3" style={{ fill: 'var(--muted-foreground)' }}>{centerLabel}</text>}
        </g>
      </svg>
      <ul className="min-w-36 flex-1 space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="font-medium tabular-nums text-muted-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LinkButton({ to, primary, icon: Icon, children }) {
  return (
    <Link
      to={to}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors ${
        primary ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90' : 'border bg-background hover:bg-muted'
      }`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Link>
  )
}

export const Empty = ({ children }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
