// Shared page chrome: header, tab bar, card.

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-6 py-4">
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

// tabs: [{ id, label, icon, count }]
export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b bg-background px-6">
      {tabs.map((t) => {
        const active = t.id === value
        const Icon = t.icon
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {t.label}
            {t.count != null && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// A card that can fill its container: header on top, body scrolls, optional footer.
export function Card({ title, description, action, footer, className = '', bodyClassName = 'p-5', children }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
      {footer && <footer className="shrink-0 border-t px-5 py-3">{footer}</footer>}
    </section>
  )
}
