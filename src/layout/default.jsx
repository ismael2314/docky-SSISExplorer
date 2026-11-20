import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { CalendarClock, LayoutDashboard, Moon, Network, Package, Route, Search, Settings, Sun, Workflow } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { getPackages } from '@/lib/api'

const navigations = [
  { id: 1, icon: LayoutDashboard, label: 'Dashboard', path: '/', end: true },
  { id: 2, icon: Network, label: 'Hierarchy', path: '/hierarchy' },
  { id: 3, icon: CalendarClock, label: 'Jobs', path: '/jobs' },
  { id: 4, icon: Route, label: 'Trace', path: '/trace' },
  { id: 5, icon: Settings, label: 'Settings', path: '/settings' },
]

const item = ({ isActive }) =>
  `relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
  }`

function Indicator({ isActive }) {
  return isActive ? <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" /> : null
}

export const DefaultLayout = () => {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [packages, setPackages] = useState([])

  useEffect(() => {
    const load = () => getPackages().then(setPackages).catch(() => setPackages([]))
    load()
    window.addEventListener('docky:files-changed', load)
    return () => window.removeEventListener('docky:files-changed', load)
  }, [])

  const visible = packages.filter((p) => !p.error)

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground">
        <div className="flex items-center gap-3 px-2 pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Workflow className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Docky</div>
            <div className="text-[11px] text-sidebar-foreground/60">SSIS documentation</div>
          </div>
        </div>

        <form
          className="relative mb-4 shrink-0"
          onSubmit={(e) => {
            e.preventDefault()
            const q = new FormData(e.currentTarget).get('q')
            if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/50" />
          <input
            name="q"
            placeholder="Search…"
            className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/60 pl-8 pr-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50 focus-visible:border-sidebar-primary"
          />
        </form>

        <nav className="shrink-0 space-y-0.5">
          {navigations.map((n) => (
            <NavLink key={n.id} to={n.path} end={n.end} className={item}>
              {({ isActive }) => (
                <>
                  <Indicator isActive={isActive} />
                  <n.icon className="h-[18px] w-[18px] shrink-0" />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-5 flex shrink-0 items-center justify-between px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          <span>Packages</span>
          <span className="rounded-full bg-sidebar-accent px-1.5 tabular-nums">{visible.length}</span>
        </div>
        {/* Only this list scrolls, so the menu stays in view however many packages there are */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {visible.map((p) => (
            <NavLink
              key={p.id}
              to={`/packages/${encodeURIComponent(p.id)}`}
              title={p.id}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                }`
              }
            >
              <Package className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{p.id}</span>
            </NavLink>
          ))}
          {visible.length === 0 && <p className="px-2.5 py-2 text-xs text-sidebar-foreground/50">No packages yet</p>}
        </nav>

        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-sidebar-border px-2 pt-3 text-xs text-sidebar-foreground/60">
          <span>Docky v0.1</span>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Toggle light and dark mode"
            title="Toggle light / dark"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-app">
        <Outlet />
      </main>
    </div>
  )
}
