// Small form building blocks shared by the Settings tabs.
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'

export const inputClass =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition ' +
  'placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-50'

export function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function Check({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

const TONE = { ok: 'tone-ok', info: 'tone-info', warn: 'tone-warn', error: 'tone-error' }
const ICON = { ok: CircleCheck, info: Info, warn: TriangleAlert, error: CircleAlert }

export function Badge({ tone = 'info', children, className = '' }) {
  return <span className={`tone ${TONE[tone]} inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

export function Notice({ tone = 'info', children }) {
  const Icon = ICON[tone]
  return (
    <div className={`tone ${TONE[tone]} flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
