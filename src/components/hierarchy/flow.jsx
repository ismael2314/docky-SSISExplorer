import { useEffect, useMemo, useRef } from 'react'
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { KindChip } from '@/components/icons'
import { childrenOf } from './tree'

const W = 240      // card size
const H = 78
const PAD = 20     // space between a box's border and what it holds
const HEAD = 46    // box title bar
const GAP_X = 30   // between tasks that can run side by side
const GAP_Y = 52   // between one step and the next

const LINK = {
  Success: { color: 'var(--muted-foreground)', label: undefined },
  Failure: { color: 'var(--danger)', label: 'on failure', dash: '6 4' },
  Completion: { color: 'var(--info)', label: 'when done' },
}

// What one card or box says.
function describe(node, isRoot) {
  const pkg = isRoot ? node : node.call
  if (isRoot) return { kind: 'package', title: pkg.name, sub: pkg.stats ? `starting package · ${pkg.stats.tasks} tasks` : 'starting package', pkg }
  if (pkg) return { kind: 'package', title: node.name, sub: `→ ${pkg.name}`, pkg }
  const n = node.children?.length ?? 0
  return {
    kind: node.kind,
    title: node.name,
    sub: node.kind === 'container' ? `${n} ${n === 1 ? 'item' : 'items'}` : node.summary,
    pkg: null,
  }
}

function Badges({ pkg, disabled }) {
  if (!((pkg && !pkg.resolved) || pkg?.cycle || pkg?.truncated || disabled)) return null
  return (
    <div className="flex flex-wrap gap-1">
      {pkg && !pkg.resolved && <span className="tone tone-warn rounded px-1.5 text-[10px] font-semibold">not uploaded</span>}
      {pkg?.cycle && <span className="tone tone-error rounded px-1.5 text-[10px] font-semibold">loop: already above</span>}
      {pkg?.truncated && <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">not expanded: too large</span>}
      {disabled && <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">disabled</span>}
    </div>
  )
}

const state = (d) =>
  `${d.active ? 'border-primary ring-4 ring-primary/40' : d.hit ? 'border-primary' : d.selected ? 'border-primary ring-2 ring-primary/30' : ''} ${
    d.dim ? 'opacity-40' : ''
  } ${d.disabled ? 'opacity-60' : ''}`

function Toggle({ data, className = '' }) {
  return (
    <button
      type="button"
      className={`nodrag nopan rounded-full border bg-background px-2 py-0.5 text-xs font-medium shadow-sm hover:bg-muted ${className}`}
      onClick={(e) => { e.stopPropagation(); data.onToggle(data.key) }}
      title={data.isOpen ? 'Collapse' : 'Expand'}
    >
      <span className="flex items-center gap-0.5">
        {data.isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {data.kids}
      </span>
    </button>
  )
}

// A task, or a container / called package that is collapsed.
function HierarchyNode({ data }) {
  return (
    <div
      className={`relative rounded-xl border bg-card px-3 py-2 text-card-foreground shadow-sm ${data.kind === 'container' ? 'border-dashed border-muted-foreground/50' : ''} ${state(data)}`}
      style={{ width: W, minHeight: H - 8 }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2" title={data.title}>
        <KindChip kind={data.kind} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.title}</div>
          <div className="truncate text-xs text-muted-foreground">{data.sub}</div>
        </div>
      </div>
      <div className="mt-1"><Badges pkg={data.pkg} disabled={data.disabled} /></div>
      {data.kids > 0 && <Toggle data={data} className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2" />}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

// An expanded container or package: a box holding its tasks in run order.
function HierarchyGroup({ data }) {
  const pkgBox = data.kind === 'package'
  return (
    <div
      className={`h-full w-full rounded-2xl border-2 ${pkgBox ? 'kind-package kind-border bg-[color-mix(in_oklab,var(--kind-package)_6%,transparent)]' : 'border-dashed border-muted-foreground/40 bg-muted/30'} ${state(data)}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 px-3" style={{ height: HEAD }} title={data.title}>
        <KindChip kind={data.kind} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{data.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">{data.sub}</div>
        </div>
        <Badges pkg={data.pkg} disabled={data.disabled} />
        <Toggle data={data} />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { h: HierarchyNode, hgroup: HierarchyGroup }

// Boxes inside boxes, like the package canvas, but top to bottom: inside every box the tasks are
// stacked in run order (what runs first on top), tasks that can run together sit side by side,
// and arrows follow the precedence constraints (grey = success, red dashed = failure, blue = completion).
export function buildFlow(root, open, { search, activeKey, selectedKey, onToggle } = {}) {
  const isBox = (n) => open.has(n.key) && childrenOf(n, true).length > 0
  const size = new Map() // key -> { w, h }
  const rel = new Map()  // key -> position inside its box

  function measure(n) {
    const kids = childrenOf(n, true)
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'TB', nodesep: GAP_X, ranksep: GAP_Y })
    const here = new Set(kids.map((k) => k.key))
    for (const k of kids) {
      let s = { w: W, h: H }
      if (isBox(k)) {
        const c = measure(k)
        s = { w: Math.max(c.w + PAD * 2, W + PAD * 2), h: c.h + PAD * 2 + HEAD }
      }
      size.set(k.key, s)
      g.setNode(String(k.key), { width: s.w, height: s.h })
    }
    for (const k of kids) for (const a of k.runsAfter ?? []) if (here.has(a.key)) g.setEdge(String(a.key), String(k.key))
    dagre.layout(g)
    for (const k of kids) {
      const p = g.node(String(k.key))
      const s = size.get(k.key)
      rel.set(k.key, { x: p.x - s.w / 2, y: p.y - s.h / 2 })
    }
    const { width, height } = g.graph()
    return { w: width, h: height }
  }

  const nodes = []
  const edges = []

  function emit(n, parent, parentAbs, isRoot) {
    const kids = childrenOf(n, true)
    const box = isBox(n)
    let s = size.get(n.key) ?? { w: W, h: H }
    if (isRoot && box) {
      const c = measure(n)
      s = { w: Math.max(c.w + PAD * 2, W + PAD * 2), h: c.h + PAD * 2 + HEAD }
    }
    const pos = isRoot ? { x: 0, y: 0 } : { x: rel.get(n.key).x + PAD, y: rel.get(n.key).y + PAD + HEAD }
    const abs = { x: parentAbs.x + pos.x, y: parentAbs.y + pos.y }

    nodes.push({
      id: String(n.key),
      type: box ? 'hgroup' : 'h',
      position: pos,
      ...(parent ? { parentId: String(parent.key) } : {}),
      ...(box ? { width: s.w, height: s.h } : {}),
      data: {
        ...describe(n, isRoot),
        key: n.key,
        kids: kids.length,
        isOpen: open.has(n.key),
        disabled: n.disabled,
        onToggle,
        cx: abs.x + s.w / 2, // centre on screen, used to jump to a search match
        cy: abs.y + s.h / 2,
        hit: !!search?.keys.has(n.key),
        active: activeKey === n.key,
        dim: !!search?.active && !search.keys.has(n.key) && !search.openKeys.has(n.key),
        selected: selectedKey === n.key,
      },
    })

    if (box) {
      kids.forEach((k) => emit(k, n, abs, false))
      for (const k of kids)
        for (const a of k.runsAfter ?? []) {
          if (!kids.some((x) => x.key === a.key)) continue
          const l = LINK[a.kind] ?? LINK.Success
          edges.push({
            id: `${a.key}>${k.key}:${a.kind}`,
            source: String(a.key),
            target: String(k.key),
            type: 'smoothstep',
            label: l.label,
            animated: a.kind === 'Failure',
            style: { stroke: l.color, strokeWidth: 2, strokeDasharray: l.dash },
            markerEnd: { type: MarkerType.ArrowClosed, color: l.color },
          })
        }
    }
  }
  emit(root, null, { x: 0, y: 0 }, true)
  return { nodes, edges } // boxes come before what is inside them, as React Flow needs
}

// Moves the view to the active search match (once per jump, and once the card exists on screen).
function Focus({ nodes, targetKey, token }) {
  const { setCenter } = useReactFlow()
  const done = useRef('')
  useEffect(() => {
    if (targetKey == null) return
    const id = `${targetKey}:${token}`
    if (done.current === id) return
    const n = nodes.find((x) => x.id === String(targetKey))
    if (!n) return // not laid out yet; runs again when it appears
    done.current = id
    setCenter(n.data.cx, n.data.cy, { zoom: 1, duration: 450 })
  }, [nodes, targetKey, token, setCenter])
  return null
}

function Inner({ root, open, onToggle, search, activeKey, token, selectedKey, onSelect, onOpenNode }) {
  const { theme } = useTheme()
  const { nodes, edges } = useMemo(
    () => buildFlow(root, open, { search, activeKey, selectedKey, onToggle }),
    [root, open, search, activeKey, selectedKey, onToggle],
  )
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={theme}
      fitView
      minZoom={0.05}
      nodesDraggable={false}
      nodesConnectable={false}
      zoomOnDoubleClick={false}
      onNodeClick={(_, n) => onSelect(Number(n.id))}
      onPaneClick={() => onSelect(null)}
      onNodeDoubleClick={(_, n) => onOpenNode(Number(n.id))}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={(n) => `var(--kind-${n.data?.kind === 'task' ? 'other' : n.data?.kind ?? 'other'})`} />
      <Focus nodes={nodes} targetKey={activeKey} token={token} />
    </ReactFlow>
  )
}

export function HierarchyFlow(props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}
