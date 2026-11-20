import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Network, Package, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/page'
import { FlowCanvas } from '@/components/canvas/flow'
import { HierarchyFlow } from '@/components/hierarchy/flow'
import {
  HierarchyTree, StatStrip, defaultOpen, expandableKeys, indexNodes, runsAfterText, searchTree,
} from '@/components/hierarchy/tree'
import { Button } from '@/components/ui/button'
import { getHierarchy, getPackages } from '@/lib/api'

const enc = encodeURIComponent
const VIEWS = [['flow', 'Flow'], ['tree', 'Tree'], ['map', 'Map']]

// ---------- map view side panel (package-level graph) ----------
function MapPanel({ data, selectedId, go }) {
  const node = data.graph.nodes.find((n) => n.id === selectedId)
  if (!node)
    return <p className="text-sm text-muted-foreground">Click a package to see what it calls and what calls it. Double-click to open it.</p>
  const calls = data.graph.edges.filter((e) => e.from === node.id)
  const calledBy = data.graph.edges.filter((e) => e.to === node.id)
  const resolved = node.details.childResolved
  const List = ({ title, items, pick }) =>
    items.length > 0 && (
      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title} ({items.length})</div>
        <ul className="mt-1 space-y-1 text-sm">
          {items.map((e) => (
            <li key={e.id}>
              <button type="button" className="text-primary hover:underline" onClick={() => go(pick(e))}>{pick(e)}</button>
              {e.count > 1 && <span className="ml-1 text-xs text-muted-foreground">×{e.count}</span>}
            </li>
          ))}
        </ul>
      </div>
    )
  return (
    <>
      <h2 className="text-lg font-semibold">{node.name}</h2>
      <p className="text-sm text-muted-foreground">{resolved ? node.subtitle : 'Referenced but not uploaded'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {resolved ? (
          <>
            <Link to={`/packages/${enc(node.id)}`}><Button>Open package →</Button></Link>
            <Link to={`/hierarchy/${enc(node.id)}?view=map`}><Button variant="outline">Hierarchy from here</Button></Link>
          </>
        ) : (
          <Link className="text-sm text-primary underline" to="/settings?tab=upload">Upload {node.details.childPackage}.dtsx</Link>
        )}
      </div>
      <List title="Calls" items={calls} pick={(e) => e.to} />
      <List title="Called by" items={calledBy} pick={(e) => e.from} />
    </>
  )
}

// ---------- flow view side panel ----------
function Results({ search, activeIndex, onJump }) {
  const n = search.list.length
  return (
    <div className="mb-4 border-b pb-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matches ({n})</div>
      {n === 0 && <p className="mt-1 text-sm text-muted-foreground">Nothing in this hierarchy matches.</p>}
      <ul className="mt-1 max-h-60 space-y-0.5 overflow-auto">
        {search.list.slice(0, 100).map((m, i) => (
          <li key={m.key}>
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${i === activeIndex ? 'bg-primary/15' : ''}`}
            >
              <span className="block truncate">{m.call ? `${m.name} → ${m.call.name}` : m.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{m.kind ? `${m.packageId}${m.summary ? ' · ' + m.summary : ''}` : 'entry package'}</span>
            </button>
          </li>
        ))}
        {n > 100 && <li className="px-2 py-1 text-xs text-muted-foreground">…and {n - 100} more. Narrow the search.</li>}
      </ul>
    </div>
  )
}

function NodePanel({ entry, rootId }) {
  if (!entry)
    return <p className="text-sm text-muted-foreground">Click a card to see what it is. Double-click to open it. Use the small arrow button on a card or box to expand or collapse what it contains.</p>
  const n = entry.node
  const isRoot = !n.kind
  const pkg = isRoot ? n : n.call
  const after = runsAfterText(n.runsAfter)
  return (
    <>
      <h2 className="text-lg font-semibold">{n.name}</h2>
      <p className="text-sm text-muted-foreground">
        {isRoot ? 'Starting package' : pkg ? `Execute Package Task → ${pkg.name}` : n.typeLabel}
        {n.disabled && ' · disabled'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {pkg?.resolved && (
          <>
            <Link to={`/packages/${enc(pkg.packageId)}`}><Button>Open package →</Button></Link>
            {pkg.packageId !== rootId && <Link to={`/hierarchy/${enc(pkg.packageId)}`}><Button variant="outline">Hierarchy from here</Button></Link>}
          </>
        )}
        {!pkg && <Link to={`/packages/${enc(n.packageId)}?node=${enc(n.id)}`}><Button>Open in package →</Button></Link>}
      </div>

      {pkg && !pkg.resolved && (
        <p className="tone tone-warn mt-3 rounded-lg px-3 py-2 text-sm">
          This package is not in the folder. <Link className="underline" to="/settings?tab=upload">Upload {pkg.name}</Link> to see what it runs.
        </p>
      )}
      {pkg?.cycle && (
        <p className="tone tone-error mt-3 rounded-lg px-3 py-2 text-sm">
          This package is already running higher up in this chain, so it would call itself again. It is not expanded.
        </p>
      )}

      {!isRoot && (
        <div className="mt-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In package</div>
          <Link className="text-primary hover:underline" to={`/packages/${enc(n.packageId)}`}>{n.packageId}</Link>
        </div>
      )}
      {n.summary && !pkg && (
        <div className="mt-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What it does</div>
          <div className="break-words">{n.summary}</div>
        </div>
      )}
      {after && (
        <div className="mt-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runs</div>
          <div>{after}</div>
        </div>
      )}
      {pkg?.resolved && pkg.stats && (
        <div className="mt-4 text-sm text-muted-foreground">
          {pkg.stats.tasks} tasks · {pkg.stats.containers} containers · {pkg.stats.dataFlows} data flows · {pkg.stats.sqlTasks} SQL tasks
        </div>
      )}
    </>
  )
}

// ---------- page ----------
export default function HierarchyPage() {
  const { packageId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = VIEWS.some(([id]) => id === params.get('view')) ? params.get('view') : 'flow'
  const nodeParam = params.get('node')

  const [list, setList] = useState(null)
  const [state, setState] = useState({ data: null, error: null })
  const [showTasks, setShowTasks] = useState(true)
  const [open, setOpen] = useState(new Set())
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState({ index: 0, token: 0 })

  useEffect(() => { getPackages().then(setList).catch(() => setList([])) }, [])

  useEffect(() => {
    if (!packageId) return
    let cancelled = false
    setState({ data: null, error: null })
    setQuery('')
    getHierarchy(packageId)
      .then((data) => {
        if (cancelled) return
        setState({ data, error: null })
        setShowTasks(true)
        setOpen(defaultOpen(data.root, true))
      })
      .catch((error) => !cancelled && setState({ data: null, error: error.message }))
    return () => { cancelled = true }
  }, [packageId])

  const { data, error } = state
  const tasks = view === 'flow' ? true : showTasks // the flow always shows tasks, because run order needs them
  const index = useMemo(() => (data ? indexNodes(data.root) : new Map()), [data])
  const search = useMemo(() => (data ? searchTree(data.root, tasks, query) : null), [data, tasks, query])
  const count = search?.list.length ?? 0
  const activeIndex = count ? cursor.index % count : 0
  const activeKey = count ? search.list[activeIndex].key : null

  // A new search jumps to its first match and opens every row on the way to the matches.
  useEffect(() => {
    if (!search?.active) return
    setCursor((c) => ({ index: 0, token: c.token + 1 }))
    setOpen((prev) => new Set([...prev, ...search.openKeys]))
  }, [search])

  const step = (d) => count && setCursor((c) => ({ index: (c.index + d + count) % count, token: c.token + 1 }))
  const jump = (i) => setCursor((c) => ({ index: i, token: c.token + 1 }))

  const toggle = useCallback((key) => setOpen((s) => {
    const n = new Set(s)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  }), [])

  const setView = (v) => {
    if (v === 'flow' && data && !showTasks) {
      setShowTasks(true)
      setOpen(defaultOpen(data.root, true))
    }
    setParams(v === 'flow' ? {} : { view: v }, { replace: true })
  }
  const pick = (id) => navigate(`/hierarchy/${enc(id)}${view === 'flow' ? '' : `?view=${view}`}`)
  const selectedKey = view === 'flow' && nodeParam != null && nodeParam !== '' ? Number(nodeParam) : null

  const openNode = (key) => {
    const n = index.get(key)?.node
    if (!n) return
    const pkg = n.kind ? n.call : n
    if (pkg) pkg.resolved && navigate(`/packages/${enc(pkg.packageId)}`)
    else navigate(`/packages/${enc(n.packageId)}?node=${enc(n.id)}`)
  }

  const groups = useMemo(() => {
    const ok = (list ?? []).filter((p) => !p.error)
    return [['Entry points (not called by another package)', ok.filter((p) => p.entryPoint)], ['Other packages', ok.filter((p) => !p.entryPoint)]]
  }, [list])

  const searchable = data && view !== 'map'

  return (
    <div className="flex h-full flex-col bg-app">
      <PageHeader icon={Network} title="Package hierarchy" subtitle="Everything a package runs, level by level" />
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-6 py-2.5">
        <select
          value={packageId ?? ''}
          onChange={(e) => e.target.value && pick(e.target.value)}
          className="h-9 min-w-56 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          aria-label="Package"
        >
          <option value="">Choose a package…</option>
          {groups.map(([label, items]) => items.length > 0 && (
            <optgroup key={label} label={label}>
              {items.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </optgroup>
          ))}
        </select>

        {searchable && (
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
                  if (e.key === 'Escape') setQuery('')
                }}
                placeholder="Search tasks, tables, packages…"
                aria-label="Search the hierarchy"
                className="h-9 w-72 rounded-lg border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            {search.active && (
              <>
                <span className="w-20 text-center text-xs tabular-nums text-muted-foreground">
                  {count ? `${activeIndex + 1} of ${count}` : 'No matches'}
                </span>
                <Button size="icon-sm" variant="outline" disabled={!count} onClick={() => step(-1)} aria-label="Previous match"><ChevronUp className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="outline" disabled={!count} onClick={() => step(1)} aria-label="Next match"><ChevronDown className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setQuery('')} aria-label="Clear search"><X className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        )}

        {data && (
          <div className="ml-auto flex rounded-lg bg-muted p-0.5" role="tablist">
            {VIEWS.map(([id, label]) => (
              <button
                key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${view === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!packageId ? (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {list === null ? <p className="text-muted-foreground">Loading…</p> : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages yet. <Link className="text-primary underline" to="/settings?tab=upload">Upload some</Link>.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Choose a package above, or start from an entry point:</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.filter((p) => !p.error && p.entryPoint).map((p) => (
                  <button key={p.id} type="button" onClick={() => pick(p.id)} className="rounded-xl border bg-card p-4 text-left hover:bg-muted/40">
                    <div className="flex items-center gap-2 font-medium"><Package className="h-4 w-4 text-muted-foreground" />{p.id}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{p.stats.tasks} tasks · calls {p.childPackages.length} packages</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : error ? (
        <p className="p-6 text-destructive">Could not load the hierarchy of “{packageId}”: {error}</p>
      ) : !data ? (
        <p className="p-6 text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="px-6 pt-3"><StatStrip summary={data.summary} /></div>
          {data.summary.truncated && (
            <p className="tone tone-warn mx-6 mt-3 rounded-lg px-3 py-2 text-sm">
              This hierarchy is very large, so some branches are not expanded.
            </p>
          )}

          {view !== 'map' && (
            <div className="flex flex-wrap items-center gap-2 px-6 pb-3 pt-3">
              <Button size="sm" variant="outline" onClick={() => setOpen(new Set(expandableKeys(data.root, tasks)))}>Expand all</Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(new Set([data.root.key]))}>Collapse all</Button>
              {view === 'tree' ? (
                <label className="ml-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox" checked={showTasks}
                    onChange={(e) => { setShowTasks(e.target.checked); setOpen(defaultOpen(data.root, e.target.checked)) }}
                  />
                  Show the tasks inside each package
                </label>
              ) : (
                <span className="ml-2 hidden text-xs text-muted-foreground md:inline">
                  Top to bottom is run order. Tasks side by side can run together.
                </span>
              )}
            </div>
          )}

          {view === 'flow' && (
            <div className="flex min-h-0 flex-1 border-t">
              <div className="min-w-0 flex-1">
                <HierarchyFlow
                  key={`flow:${packageId}`}
                  root={data.root}
                  open={open}
                  onToggle={toggle}
                  search={search}
                  activeKey={activeKey}
                  token={cursor.token}
                  selectedKey={selectedKey}
                  onSelect={(k) => setParams(k == null ? {} : { node: String(k) }, { replace: true })}
                  onOpenNode={openNode}
                />
              </div>
              <aside className="w-80 shrink-0 overflow-auto border-l p-4">
                {search.active && <Results search={search} activeIndex={activeIndex} onJump={jump} />}
                <NodePanel entry={index.get(selectedKey)} rootId={data.root.packageId} />
              </aside>
            </div>
          )}

          {view === 'tree' && (
            <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 pt-4">
              <HierarchyTree
                root={data.root} showTasks={showTasks} open={open} onToggle={toggle}
                search={search} activeKey={activeKey} token={cursor.token}
              />
            </div>
          )}

          {view === 'map' && (
            <div className="mt-4 flex min-h-0 flex-1 border-t">
              <div className="min-w-0 flex-1">
                <FlowCanvas
                  key={`hierarchy:${packageId}`}
                  layoutKey={`hierarchy:${packageId}`}
                  graph={data.graph}
                  selectedId={nodeParam}
                  onSelect={(id) => setParams(id ? { view: 'map', node: id } : { view: 'map' }, { replace: true })}
                  onOpen={(id) => data.graph.nodes.find((n) => n.id === id)?.details.childResolved && navigate(`/packages/${enc(id)}`)}
                />
              </div>
              <aside className="w-80 shrink-0 overflow-auto border-l p-4">
                <MapPanel data={data} selectedId={nodeParam} go={(id) => setParams({ view: 'map', node: id }, { replace: true })} />
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  )
}
