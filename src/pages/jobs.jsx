import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock, CalendarX2, ChevronDown, ChevronRight, CircleAlert, Clock, KeyRound, Package, Play, RefreshCw, Search, Server, Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page'
import { Badge, Check, Field, Notice, inputClass } from '@/components/form'
import { getJobs, getSettings, saveSettings } from '@/lib/api'
import { clearSession, setSession, useSqlSession } from '@/lib/sqlSession'

// ---------- time helpers: msdb times are the server's clock, so everything is compared as plain strings ----------
const ms = (naive) => (naive ? Date.parse(naive.replace(' ', 'T') + 'Z') : null)
const hhmm = (naive) => naive?.slice(11, 16)
const dayLabel = (day, now) => {
  const today = now.slice(0, 10)
  const tomorrow = new Date(ms(today + ' 00:00:00') + 86400000).toISOString().slice(0, 10)
  if (day === today) return 'Today'
  if (day === tomorrow) return 'Tomorrow'
  return new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function untilText(next, now) {
  const d = ms(next) - ms(now)
  if (d < 0) return 'overdue'
  const m = Math.round(d / 60000)
  if (m < 1) return 'in under a minute'
  if (m < 60) return `in ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `in ${h} h ${m % 60} min`
  const days = Math.floor(h / 24)
  return `in ${days} d ${h % 24} h`
}
const duration = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)

const OUTCOME = {
  succeeded: { tone: 'ok', text: 'Succeeded' },
  failed: { tone: 'error', text: 'Failed' },
  canceled: { tone: 'warn', text: 'Canceled' },
  retry: { tone: 'warn', text: 'Retrying' },
  unknown: { tone: 'info', text: 'Unknown' },
}

const SORTS = [
  ['next', 'Next run: soonest first'],
  ['time', 'Time of day'],
  ['name', 'Name (A to Z)'],
  ['last', 'Last run: most recent'],
]
const nullsLast = (a, b, cmp) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : cmp(a, b))
const COMPARE = {
  next: (a, b) => nullsLast(a.nextRun, b.nextRun, (x, y) => x.localeCompare(y)) || a.name.localeCompare(b.name),
  time: (a, b) => nullsLast(a.timeOfDay, b.timeOfDay, (x, y) => x.localeCompare(y)) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  last: (a, b) => nullsLast(a.lastRun?.at, b.lastRun?.at, (x, y) => y.localeCompare(x)) || a.name.localeCompare(b.name),
}

const FILTERS = [
  ['all', 'All', () => true],
  ['enabled', 'Enabled', (j) => j.enabled],
  ['disabled', 'Disabled', (j) => !j.enabled],
  ['running', 'Running', (j) => j.status === 'running'],
  ['failed', 'Last run failed', (j) => j.lastRun?.outcome === 'failed'],
  ['ssis', 'Runs SSIS', (j) => j.steps.some((s) => s.package)],
]

// ---------- connect form ----------
function ConnectCard({ settings, error, onConnect }) {
  const base = settings?.sql ?? {}
  const [form, setForm] = useState({ server: '', port: '', authType: 'sql', user: '', domain: '', trustServerCertificate: false, ...base })
  const [password, setPassword] = useState('')
  useEffect(() => { setForm((f) => ({ ...f, ...base })) }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm"
        onSubmit={(e) => { e.preventDefault(); onConnect({ ...base, ...form }, password) }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-semibold">Connect to SQL Server Agent</h2>
            <p className="text-sm text-muted-foreground">Enter a SQL login to list the jobs and when they run.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-6 gap-3">
          <Field label="Server" className="col-span-4"><input className={inputClass} value={form.server} onChange={set('server')} placeholder="SQL01\PROD" autoComplete="off" required /></Field>
          <Field label="Port" className="col-span-2"><input className={inputClass} value={form.port} onChange={set('port')} inputMode="numeric" placeholder="1433" /></Field>
          <Field label="Sign in with" className="col-span-6">
            <select className={inputClass} value={form.authType} onChange={set('authType')}>
              <option value="sql">SQL Server login</option>
              <option value="windows">Windows login (domain)</option>
            </select>
          </Field>
          {form.authType === 'windows' && <Field label="Domain" className="col-span-6"><input className={inputClass} value={form.domain} onChange={set('domain')} /></Field>}
          <Field label="User name" className="col-span-3"><input className={inputClass} value={form.user} onChange={set('user')} autoComplete="off" required /></Field>
          <Field label="Password" className="col-span-3"><input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          <div className="col-span-6">
            <Check
              label="Trust the server certificate"
              hint="Needed for self-signed certificates, common on internal servers."
              checked={!!form.trustServerCertificate}
              onChange={(v) => setForm((f) => ({ ...f, trustServerCertificate: v }))}
            />
          </div>
          {error && <div className="col-span-6"><Notice tone="error">{error}</Notice></div>}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button type="submit"><KeyRound className="mr-1.5 h-4 w-4" />Connect</Button>
          <p className="text-xs text-muted-foreground">The server and user name are remembered. The password is kept in memory for this browser session only.</p>
        </div>
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          The login needs read access to the <code>msdb</code> database, for example the <code>SQLAgentReaderRole</code> role.
        </p>
      </form>
    </div>
  )
}

// ---------- one job ----------
function PackageChip({ pkg }) {
  const body = (
    <>
      <Package className="h-3 w-3 shrink-0" />
      <span className="truncate">{pkg.name}</span>
    </>
  )
  return pkg.known ? (
    <Link to={`/packages/${encodeURIComponent(pkg.id)}`} onClick={(e) => e.stopPropagation()} title="Open this package" className="kind-chip kind-package inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:underline">
      {body}
    </Link>
  ) : (
    <span title="Not uploaded to Docky" className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{body}</span>
  )
}

function StatusBadge({ job }) {
  if (job.status === 'running')
    return <span className="tone tone-info inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />Running</span>
  if (job.status === 'disabled') return <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Disabled</span>
  if (job.status === 'unscheduled') return <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">No upcoming run</span>
  return null
}

const COLS = 'grid grid-cols-[28px_118px_minmax(0,2.2fr)_minmax(0,1.7fr)_minmax(0,1.4fr)_minmax(0,1.5fr)] items-start gap-x-4'

function JobRow({ job, now, open, onToggle }) {
  const packages = job.steps.map((s) => s.package).filter(Boolean)
  const live = job.schedules.filter((s) => s.enabled)
  const shown = live[0] ?? job.schedules[0]
  return (
    <>
      <div className={`${COLS} cursor-pointer border-b px-5 py-3 hover:bg-muted/40 ${open ? 'bg-muted/30' : ''} ${job.enabled ? '' : 'opacity-70'}`} onClick={onToggle}>
        <span className="pt-1 text-muted-foreground">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>

        <div>
          {job.nextRun ? (
            <>
              <div className="text-base font-semibold tabular-nums leading-tight">{hhmm(job.nextRun)}</div>
              <div className="text-xs text-muted-foreground">{job.status === 'running' ? 'running now' : untilText(job.nextRun, now)}</div>
            </>
          ) : (
            <div className="pt-0.5 text-sm text-muted-foreground">{job.status === 'running' ? 'Running now' : '-'}</div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{job.name}</span>
            <StatusBadge job={job} />
          </div>
          <div className="truncate text-xs text-muted-foreground">{[job.category, job.owner].filter(Boolean).join(' · ')}</div>
        </div>

        <div className="min-w-0 text-sm">
          {shown ? <div className="line-clamp-2" title={shown.text}>{shown.text}</div> : <div className="text-muted-foreground">No schedule</div>}
          {job.schedules.length > 1 && <div className="text-xs text-muted-foreground">+{job.schedules.length - 1} more schedule{job.schedules.length > 2 ? 's' : ''}</div>}
        </div>

        <div className="min-w-0 text-sm">
          {job.lastRun ? (
            <>
              <Badge tone={OUTCOME[job.lastRun.outcome].tone}>{OUTCOME[job.lastRun.outcome].text}</Badge>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{job.lastRun.at.slice(0, 16)} · {duration(job.lastRun.seconds)}</div>
            </>
          ) : <span className="text-muted-foreground">Never run</span>}
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5">
          {packages.length ? packages.map((p, i) => <PackageChip key={i} pkg={p} />) : <span className="text-sm text-muted-foreground">-</span>}
        </div>
      </div>

      {open && (
        <div className="grid gap-6 border-b bg-muted/20 px-5 py-4 pl-[3.75rem] text-sm lg:grid-cols-2">
          <div className="space-y-4">
            {job.description && <p>{job.description}</p>}
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedules</div>
              {job.schedules.length === 0 && <p className="text-muted-foreground">This job has no schedule. It only runs when started by hand or by another job.</p>}
              <ul className="space-y-1.5">
                {job.schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={s.enabled ? '' : 'text-muted-foreground line-through'}>{s.text}</span>
                    {!s.enabled && <Badge tone="info" className="!bg-muted !text-muted-foreground">schedule disabled</Badge>}
                    {s.enabled && s.nextRun && <span className="text-xs text-muted-foreground">next {s.nextRun.slice(0, 16)}</span>}
                  </li>
                ))}
              </ul>
            </div>
            {job.lastRun?.message && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last outcome message</div>
                <p className={`text-xs ${job.lastRun.outcome === 'failed' ? 'text-error' : 'text-muted-foreground'}`}>{job.lastRun.message}</p>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps ({job.steps.length})</div>
            <ol className="space-y-2">
              {job.steps.map((s) => (
                <li key={s.id} className="rounded-lg border bg-card px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{s.id}</span>
                    <span className="font-medium">{s.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{s.subsystem}</span>
                    {s.package && <PackageChip pkg={s.package} />}
                  </div>
                  {s.package?.folder && <div className="mt-1 text-xs text-muted-foreground">Catalog: {s.package.folder} / {s.package.project}</div>}
                  {!s.package && s.command && <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{s.command}</pre>}
                </li>
              ))}
              {job.steps.length === 0 && <li className="text-muted-foreground">No steps.</li>}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}

// ---------- page ----------
export default function JobsPage() {
  const session = useSqlSession()
  const [settings, setSettings] = useState(null)
  const [state, setState] = useState({ data: null, loading: false, error: null })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('next')
  const [open, setOpen] = useState(new Set())

  useEffect(() => { getSettings().then(setSettings).catch(() => setSettings({ sql: {} })) }, [])

  // Either the login typed this session, or the server's own password (DOCKY_SQL_PASSWORD) with the saved server.
  const credentials = useMemo(() => {
    if (session) return session
    if (settings?.sql?.server && settings.sqlPasswordFromEnv) return { connection: settings.sql, password: '', fromServer: true }
    return null
  }, [session, settings])

  const load = useCallback((cred) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    return getJobs(cred.connection, cred.password)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: e.message }))
  }, [])

  useEffect(() => { if (credentials) load(credentials) }, [credentials, load])

  const connect = async (connection, password) => {
    setState({ data: null, loading: false, error: null })
    setSession({ connection, password })
    saveSettings({ ...settings.sql, ...connection }).catch(() => {}) // remember server and user, never the password
  }
  const disconnect = () => { clearSession(); setState({ data: null, loading: false, error: null }) }

  const { data, loading, error } = state
  const now = data?.now ?? ''

  const rows = useMemo(() => {
    if (!data) return []
    const f = FILTERS.find((x) => x[0] === filter)[2]
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return data.jobs
      .filter(f)
      .filter((j) => {
        const text = [j.name, j.category, j.owner, ...j.steps.map((s) => `${s.name} ${s.package?.name ?? ''}`), ...j.schedules.map((s) => s.text)].join(' ').toLowerCase()
        return words.every((w) => text.includes(w))
      })
      .sort(COMPARE[sort])
  }, [data, filter, query, sort])

  // Group by the day of the next run when sorted by it.
  const groups = useMemo(() => {
    if (sort !== 'next') return [{ key: 'all', label: null, jobs: rows }]
    const m = new Map()
    for (const j of rows) {
      const key = j.nextRun ? j.nextRun.slice(0, 10) : 'none'
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(j)
    }
    return [...m.entries()].map(([key, jobs]) => ({ key, label: key === 'none' ? 'No upcoming run' : dayLabel(key, now), jobs }))
  }, [rows, sort, now])

  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ----- not connected yet
  if (!credentials)
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={CalendarClock} title="Jobs" subtitle="SQL Server Agent jobs, in the order they run" />
        <ConnectCard settings={settings} error={error} onConnect={connect} />
      </div>
    )

  const subtitle = data
    ? `${settings?.sql?.server ?? credentials.connection.server} · ${data.summary.total} jobs · server time ${data.now.slice(0, 16)}`
    : `${credentials.connection.server}`

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={CalendarClock}
        title="Jobs"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="outline" onClick={() => load(credentials)} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button variant="outline" onClick={disconnect}><Unplug className="mr-1.5 h-4 w-4" />Change connection</Button>
          </>
        }
      />

      {error && (
        <div className="p-6">
          <Notice tone="error">
            <div className="font-medium">Could not load the jobs</div>
            <div className="mt-0.5">{error}</div>
          </Notice>
        </div>
      )}
      {loading && !data && <p className="p-6 text-sm text-muted-foreground">Reading the jobs from SQL Server…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 px-6 pt-5 sm:grid-cols-3 xl:grid-cols-5">
            {[
              ['Jobs', data.summary.total, CalendarClock, 'all', ''],
              ['Enabled', data.summary.enabled, Play, 'enabled', ''],
              ['Running now', data.summary.running, RefreshCw, 'running', ''],
              ['Last run failed', data.summary.failed, CircleAlert, 'failed', data.summary.failed ? 'alert' : ''],
              ['Run SSIS packages', data.summary.withSsis, Package, 'ssis', ''],
            ].map(([label, value, Icon, f, alert]) => (
              <button
                key={label} type="button" onClick={() => setFilter(f)}
                className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition hover:border-foreground/25 ${filter === f && f !== 'all' ? 'border-primary ring-1 ring-primary/30' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert ? 'tone tone-error' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
                <span>
                  <span className="block text-2xl font-semibold leading-none tabular-nums tracking-tight">{value}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-y bg-background px-6 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs, steps, packages…" aria-label="Search jobs"
                className="h-9 w-72 rounded-lg border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              />
            </div>
            <div className="flex rounded-lg bg-muted p-0.5">
              {FILTERS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${filter === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              Order by
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground">
                {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-card">
            <div className={`${COLS} sticky top-0 z-10 border-b bg-muted/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur`}>
              <span /><span>Next run</span><span>Job</span><span>Schedule</span><span>Last run</span><span>SSIS packages</span>
            </div>
            {rows.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <CalendarX2 className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">No jobs match.</p>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <div className="sticky top-[41px] z-[5] flex items-center gap-2 border-b bg-background/95 px-5 py-2 text-sm font-semibold backdrop-blur">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {g.label}
                    <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{g.jobs.length}</span>
                  </div>
                )}
                {g.jobs.map((j) => <JobRow key={j.id} job={j} now={now} open={open.has(j.id)} onToggle={() => toggle(j.id)} />)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
