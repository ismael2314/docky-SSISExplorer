import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight, Boxes, Cog, Database, LayoutDashboard, Network, OctagonAlert, Package, Plug, Search, Table2, Upload, Workflow,
} from 'lucide-react'
import { PageHeader } from '@/components/page'
import { KindChip } from '@/components/icons'
import { BarList, Card, Donut, Empty, Kpi, LinkButton } from './widgets'

const KINDS = {
  dataflow: { label: 'Data flows', color: 'var(--kind-dataflow)' },
  sql: { label: 'SQL tasks', color: 'var(--kind-sql)' },
  package: { label: 'Package calls', color: 'var(--kind-package)' },
  container: { label: 'Containers', color: 'var(--kind-container)' },
  mail: { label: 'Mail tasks', color: 'var(--kind-mail)' },
  script: { label: 'Script tasks', color: 'var(--kind-script)' },
  task: { label: 'Other tasks', color: 'var(--kind-other)' },
}
const OP_COLORS = {
  EXEC: 'var(--kind-sql)', TRUNCATE: 'var(--danger)', INSERT: 'var(--success)',
  DELETE: 'var(--danger)', UPDATE: 'var(--warning)', MERGE: 'var(--kind-script)',
}

const pkgLink = (id) => `/packages/${encodeURIComponent(id)}`
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortList = (items, max = 4) =>
  items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`

// ---------- needs attention ----------
function Attention({ a }) {
  const items = []
  if (a.failed.length)
    items.push({
      tone: 'error', icon: OctagonAlert, title: `${plural(a.failed.length, 'file')} could not be read`,
      detail: shortList(a.failed.map((f) => f.fileName)), to: '/settings?tab=files', cta: 'Review',
    })
  if (a.missingChildren.length)
    items.push({
      tone: 'warn', icon: Package, title: `${plural(a.missingChildren.length, 'child package')} not uploaded`,
      detail: shortList(a.missingChildren.map((c) => c.name)), to: '/settings?tab=upload', cta: 'Upload',
    })
  if (a.unnamedConnections.length)
    items.push({
      tone: 'warn', icon: Plug, title: `${plural(a.unnamedConnections.length, 'connection')} without a name`,
      detail: 'Upload the project\u2019s .conmgr files (or its .ispac) to name them.', to: '/settings?tab=upload', cta: 'Upload',
    })
  if (a.mismatches.length)
    items.push({
      tone: 'warn', icon: ArrowLeftRight, title: 'Mapped columns whose type changes',
      links: a.mismatches.map((m) => ({
        label: `${m.componentName}.${m.column} (${m.from} → ${m.to})`,
        to: `/packages/${encodeURIComponent(m.package)}/dataflow/${encodeURIComponent(m.taskId)}?node=${encodeURIComponent(m.component)}`,
      })),
    })

  if (!items.length)
    return <div className="tone tone-ok rounded-lg px-3 py-5 text-center text-sm font-medium">Nothing needs attention</div>

  return (
    <ul className="space-y-4">
      {items.map((it) => (
        <li key={it.title} className="flex gap-3">
          <span className={`tone tone-${it.tone} flex h-8 w-8 shrink-0 items-center justify-center rounded-lg`}>
            <it.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-snug">{it.title}</div>
            {it.detail && <div className="mt-0.5 text-xs text-muted-foreground">{it.detail}</div>}
            {it.links?.map((l) => (
              <Link key={l.to} to={l.to} className="block truncate text-xs text-primary hover:underline">{l.label}</Link>
            ))}
          </div>
          {it.to && <Link to={it.to} className="shrink-0 pt-0.5 text-xs font-medium text-primary hover:underline">{it.cta} →</Link>}
        </li>
      ))}
    </ul>
  )
}

// ---------- packages table ----------
function PackagesTable({ rows }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => rows.filter((r) => r.id.toLowerCase().includes(q.toLowerCase())), [rows, q])
  return (
    <Card
      title="Packages"
      description={`${rows.length} in the folder, largest first`}
      bodyClassName="p-0"
      footer={<p className="text-xs text-muted-foreground">Children shows how many called packages are in the folder. An entry point is not called by any other package.</p>}
      action={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter packages"
            className="h-8 w-48 rounded-lg border bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>
      }
    >
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Package</th>
              <th className="px-3 py-2.5 text-right font-semibold">Tasks</th>
              <th className="px-3 py-2.5 text-right font-semibold">Data flows</th>
              <th className="px-3 py-2.5 text-right font-semibold">SQL</th>
              <th className="px-5 py-2.5 text-right font-semibold">Children</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <KindChip kind="package" size="sm" />
                    <Link to={pkgLink(r.id)} className="font-medium hover:text-primary hover:underline">{r.id}</Link>
                    {r.entryPoint && <span className="tone tone-info rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">entry</span>}
                    <Link to={`/hierarchy/${encodeURIComponent(r.id)}`} title="Show hierarchy" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Network className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.tasks}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.dataFlows}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.sqlTasks}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {r.children.total === 0 ? <span className="text-muted-foreground">-</span> : (
                    <span className={r.children.missing ? 'text-warn font-medium' : ''}>
                      {r.children.total - r.children.missing}/{r.children.total}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5}><Empty>No package matches “{q}”.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------- tables and procedures ----------
function TablesCard({ tables, procedures }) {
  return (
    <Card title="Tables and procedures" description="What the packages write to, read from and call" bodyClassName="p-0 max-h-72"
      footer={<p className="text-xs text-muted-foreground">Reads inside custom SQL queries are not listed yet; only tables a source reads directly.</p>}>
      {tables.length === 0 && procedures.length === 0 && <Empty>Nothing found yet.</Empty>}
      <ul className="divide-y">
        {tables.map((t) => (
          <li key={t.name} className="flex items-center gap-2 px-5 py-2.5">
            <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={t.name}>{t.name}</span>
            {t.writtenBy.length > 0 && <span title={`Written by ${t.writtenBy.join(', ')}`} className="tone tone-error rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">write ×{t.writtenBy.length}</span>}
            {t.readBy.length > 0 && <span title={`Read by ${t.readBy.join(', ')}`} className="tone tone-info rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">read ×{t.readBy.length}</span>}
          </li>
        ))}
        {procedures.map((p) => (
          <li key={p.name} className="flex items-center gap-2 px-5 py-2.5">
            <Cog className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={p.name}>{p.name}</span>
            <span title={`Called by ${p.packages.join(', ')}`} className="kind-chip kind-sql rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">proc</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ConnectionsCard({ connections }) {
  return (
    <Card title="Connections" description="Where the packages read and write" bodyClassName="p-0 max-h-64">
      {connections.length === 0 && <Empty>No connections found.</Empty>}
      <ul className="divide-y">
        {connections.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-5 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.name ? 'bg-success' : 'bg-warning'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{c.name ?? 'Name unknown'}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{plural(c.usedBy.length, 'package')}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {c.name ? [c.type, c.server, c.database].filter(Boolean).join(' · ') || 'Details come from a .conmgr file' : c.id}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function RecentCard({ files }) {
  return (
    <Card title="Recent files" description="Last added or changed" bodyClassName="p-0">
      <ul className="divide-y">
        {files.map((f) => (
          <li key={f.name} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            {f.type === 'package' ? <Package className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Plug className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{new Date(f.modified).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------- the page ----------
export function Dashboard({ data }) {
  const t = data.totals

  if (t.packages === 0 && t.failed === 0)
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={LayoutDashboard} title="Dashboard" subtitle="Nothing documented yet" />
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Package className="h-8 w-8" /></span>
          <h2 className="mt-5 text-xl font-semibold">No packages yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload SSIS packages, or connect to a SQL Server and import from its SSIS catalog. Everything on this page is built from them.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <LinkButton primary icon={Upload} to="/settings?tab=upload">Upload packages</LinkButton>
            <LinkButton icon={Database} to="/settings?tab=sql">Connect to SQL Server</LinkButton>
          </div>
        </div>
      </div>
    )

  const kinds = data.kinds.map((k) => ({ ...(KINDS[k.kind] ?? KINDS.task), value: k.count }))
  const ops = data.sqlOps.map((o) => ({ label: o.op, value: o.count, color: OP_COLORS[o.op] ?? 'var(--kind-other)' }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle={`${plural(t.packages, 'package')} documented · updated ${new Date(data.generatedAt).toLocaleTimeString()}`}
        actions={
          <>
            <LinkButton icon={Database} to="/settings?tab=sql">Import from SQL Server</LinkButton>
            <LinkButton primary icon={Upload} to="/settings?tab=upload">Upload packages</LinkButton>
          </>
        }
      />
      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={Package} kind="package" label="Packages" value={t.packages} sub={`${t.entryPoints} entry ${t.entryPoints === 1 ? 'point' : 'points'}`} />
          <Kpi icon={Boxes} kind="container" label="Tasks" value={t.tasks} sub={`in ${plural(t.containers, 'container')}`} />
          <Kpi icon={Workflow} kind="dataflow" label="Data flows" value={t.dataFlows} sub={`${t.mappedColumns} columns mapped`} />
          <Kpi icon={Database} kind="sql" label="SQL tasks" value={t.sqlTasks} sub={`${plural(t.procedures, 'procedure')} called`} />
          <Kpi icon={Table2} kind="destination" label="Tables written" value={t.tablesWritten} sub={`${t.tablesRead} read directly`} />
          <Kpi
            icon={Plug} kind="source" label="Connections" value={t.connections}
            sub={t.connectionsUnnamed ? `${t.connectionsUnnamed} without a name` : 'all named'} alert={t.connectionsUnnamed > 0}
            to={t.connectionsUnnamed ? '/settings?tab=upload' : undefined}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <div className="grid gap-6 md:grid-cols-2">
              <Card title="What the packages are made of" description="Tasks and containers by type"><Donut segments={kinds} centerLabel="items" /></Card>
              <Card title="SQL statements" description="Execute SQL tasks by operation">
                {ops.length ? <BarList items={ops} /> : <Empty>No SQL tasks found.</Empty>}
              </Card>
            </div>
            <PackagesTable rows={data.packages} />
          </div>

          <div className="space-y-6">
            <Card title="Needs attention" description="Things that limit what can be documented"><Attention a={data.attention} /></Card>
            <ConnectionsCard connections={data.connections} />
            <TablesCard tables={data.tables} procedures={data.procedures} />
            <RecentCard files={data.recentFiles} />
          </div>
        </div>
      </div>
    </div>
  )
}
