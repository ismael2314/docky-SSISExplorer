import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { KindChip } from '@/components/icons'

const enc = encodeURIComponent
const pkgPath = (id) => `/packages/${enc(id)}`

// The calls (Execute Package Tasks) found anywhere below a list of tasks, in order.
const callsIn = (list) => list.flatMap((n) => (n.call ? [n] : callsIn(n.children ?? [])))

// What a row expands into. A package task expands into the package it calls.
export function childrenOf(node, showTasks) {
  const list = node.call ? (node.call.children ?? []) : (node.children ?? [])
  return showTasks ? list : callsIn(list)
}

// Keys of every row that can be expanded.
export function expandableKeys(root, showTasks) {
  const keys = []
  const walk = (n) => {
    const kids = childrenOf(n, showTasks)
    if (kids.length) keys.push(n.key)
    kids.forEach(walk)
  }
  walk(root)
  return keys
}

// Small trees open fully; big ones open just the first levels so the page stays readable.
export function defaultOpen(root, showTasks) {
  const all = expandableKeys(root, showTasks)
  if (all.length <= 120) return new Set(all)
  const shallow = new Set([root.key])
  childrenOf(root, showTasks).forEach((c) => shallow.add(c.key))
  return shallow
}

// Case-insensitive search over names, summaries (SQL targets, tables) and the packages being called.
// Several words must all match. Only rows that exist in the current mode are searched.
export function searchTree(root, showTasks, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const result = { active: words.length > 0, list: [], keys: new Set(), openKeys: new Set() }
  if (!words.length) return result
  const text = (n) => [n.name, n.summary, n.call?.name, n.typeLabel].filter(Boolean).join(' ').toLowerCase()
  const path = []
  const walk = (n) => {
    const t = text(n)
    if (words.every((w) => t.includes(w))) {
      result.list.push(n)
      result.keys.add(n.key)
      path.forEach((k) => result.openKeys.add(k)) // rows that must be open to reveal this match
    }
    path.push(n.key)
    childrenOf(n, showTasks).forEach(walk)
    path.pop()
  }
  walk(root)
  return result
}

// Every node by key, with the key of its parent (for the details panel).
export function indexNodes(root) {
  const map = new Map()
  const walk = (n, parentKey) => {
    map.set(n.key, { node: n, parentKey })
    childrenOf(n, true).forEach((c) => walk(c, n.key))
  }
  walk(root, null)
  return map
}

export function runsAfterText(runsAfter = []) {
  return runsAfter
    .map((a) => (a.kind === 'Failure' ? `on failure of ${a.name}` : a.kind === 'Completion' ? `after ${a.name} (any result)` : `after ${a.name}`))
    .join(', ')
}

const Badge = ({ tone, children }) => (
  <span
    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
      { warn: 'tone tone-warn', loop: 'tone tone-error', mute: 'bg-muted text-muted-foreground' }[tone]
    }`}
  >
    {children}
  </span>
)

function Row({ node, depth, open, onToggle, showTasks, isRoot, search, activeKey, token }) {
  const pkg = isRoot ? node : node.call // the package this row stands for, if any
  const kids = childrenOf(node, showTasks)
  const expandable = kids.length > 0
  const isOpen = open.has(node.key)
  const stop = (e) => e.stopPropagation()
  const hit = search?.keys.has(node.key)
  const active = activeKey === node.key
  const dim = search?.active && !hit && !search.openKeys.has(node.key)
  const ref = useRef(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active, token])

  let title
  let sub = null
  if (isRoot) {
    title = <Link to={pkgPath(pkg.packageId)} onClick={stop} className="font-semibold text-primary hover:underline">{pkg.name}</Link>
  } else if (pkg && !showTasks) {
    title = pkg.resolved
      ? <Link to={pkgPath(pkg.packageId)} onClick={stop} className="font-medium text-primary hover:underline">{pkg.name}</Link>
      : <span className="font-medium">{pkg.name}</span>
    sub = `via ${node.name}`
  } else if (pkg) {
    title = <span className="font-medium">{node.name}</span>
    sub = (
      <>
        → {pkg.resolved
          ? <Link to={pkgPath(pkg.packageId)} onClick={stop} className="text-primary hover:underline">{pkg.name}</Link>
          : pkg.name}
      </>
    )
  } else {
    title = (
      <Link to={`${pkgPath(node.packageId)}?node=${enc(node.id)}`} onClick={stop} className="font-medium hover:underline">
        {node.name}
      </Link>
    )
    sub = node.kind === 'container' ? `${node.children.length} ${node.children.length === 1 ? 'item' : 'items'}` : node.summary
  }

  const after = !isRoot && showTasks ? runsAfterText(node.runsAfter) : ''

  return (
    <>
      <div
        ref={ref}
        className={`flex items-center gap-2.5 border-b py-2 pr-4 text-sm ${expandable ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/30'} ${
          active ? 'bg-primary/20 ring-1 ring-inset ring-primary' : hit ? 'bg-primary/10' : ''
        } ${dim ? 'opacity-45' : ''}`}
        style={{ paddingLeft: 8 + depth * 22 }}
        onClick={expandable ? () => onToggle(node.key) : undefined}
      >
        <span className="flex w-4 shrink-0 justify-center text-muted-foreground">
          {expandable && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
        </span>
        <KindChip kind={isRoot || pkg ? 'package' : node.kind} size="sm" />
        <span className="min-w-0 truncate">{title}</span>
        {sub && <span className="min-w-0 truncate text-xs text-muted-foreground">{sub}</span>}
        {pkg?.resolved && !pkg.cycle && pkg.stats && (
          <span className="shrink-0 text-xs text-muted-foreground">· {pkg.stats.tasks} {pkg.stats.tasks === 1 ? 'task' : 'tasks'}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {after && <span className="hidden text-xs text-muted-foreground md:inline">{after}</span>}
          {pkg && !pkg.resolved && <Badge tone="warn">not uploaded</Badge>}
          {pkg?.cycle && <Badge tone="loop">loop: already above</Badge>}
          {pkg?.truncated && <Badge tone="mute">not expanded: too large</Badge>}
          {node.disabled && <Badge tone="mute">disabled</Badge>}
        </span>
      </div>
      {expandable && isOpen &&
        kids.map((k) => (
          <Row key={k.key} node={k} depth={depth + 1} open={open} onToggle={onToggle} showTasks={showTasks} search={search} activeKey={activeKey} token={token} />
        ))}
    </>
  )
}

export function HierarchyTree({ root, showTasks, open, onToggle, search, activeKey, token }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Row node={root} depth={0} open={open} onToggle={onToggle} showTasks={showTasks} isRoot search={search} activeKey={activeKey} token={token} />
      {childrenOf(root, showTasks).length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {showTasks ? 'This package has no tasks.' : 'This package does not call other packages.'}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, tone, title }) {
  const tones = { warn: 'text-warn', loop: 'text-error' }
  return (
    <div className="rounded-xl border bg-card px-4 py-2.5 shadow-sm" title={title}>
      <div className={`text-2xl font-semibold tabular-nums leading-none tracking-tight ${tones[tone] ?? ''}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export function StatStrip({ summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Packages in hierarchy" value={summary.packages} />
      <Stat label="Levels deep" value={summary.levels} />
      <Stat label="Tasks" value={summary.tasks} />
      <Stat label="Data flows" value={summary.dataFlows} />
      <Stat
        label="Not uploaded"
        value={summary.missing}
        tone={summary.missing ? 'warn' : undefined}
        title={summary.missingNames.join(', ')}
      />
      <Stat label="Loops" value={summary.loops} tone={summary.loops ? 'loop' : undefined} />
    </div>
  )
}
