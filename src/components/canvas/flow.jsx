import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel, MarkerType,
  applyNodeChanges, useNodesInitialized, useReactFlow, useStore,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TaskNode } from './nodes/TaskNode'
import { ContainerNode } from './nodes/ContainerNode'
import { layout } from './layout'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'

const nodeTypes = { task: TaskNode, container: ContainerNode }

const edgeColor = {
  Success: 'var(--muted-foreground)',
  Failure: 'var(--danger)',
  Completion: 'var(--info)',
}

// ---------- remembered layout (per browser for now; moves to the server with the portal) ----------
const storageKey = (k) => `docky:layout:v1:${k}`

function loadLayout(key) {
  try { return JSON.parse(localStorage.getItem(storageKey(key)) ?? '{}') } catch { return {} }
}
function saveLayout(key, nodes) {
  const data = Object.fromEntries(
    nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.width, h: n.height }]),
  )
  try { localStorage.setItem(storageKey(key), JSON.stringify(data)) } catch { /* storage full or blocked */ }
}
function clearLayout(key) {
  try { localStorage.removeItem(storageKey(key)) } catch { /* ignore */ }
}
// Nodes that no longer exist are ignored; new nodes keep their automatic position.
function applySaved(nodes, saved) {
  return nodes.map((n) => {
    const s = saved[n.id]
    if (!s) return n
    return {
      ...n,
      position: { x: s.x, y: s.y },
      ...(n.type === 'container' && s.w && s.h ? { width: s.w, height: s.h } : {}),
    }
  })
}

// One short line shown under the task name on its card.
function subtitleOf(n) {
  if (n.subtitle) return n.subtitle
  const d = n.details ?? {}
  switch (n.kind) {
    case 'sql':
      return d.operation ? `${d.operation} ${d.target ?? ''}`.trim() : n.typeLabel
    case 'package':
      return d.childResolved ? d.childPackage : `${d.childPackage} (not found)`
    case 'source':
    case 'destination':
      return d.table ?? d.tableVariable ?? d.sqlVariable ?? n.typeLabel
    default:
      return n.typeLabel
  }
}

export function toFlow(g) {
  const hasChildren = new Set(g.nodes.map((n) => n.parent).filter(Boolean))

  const nodes = g.nodes.map((n) => ({
    id: n.id,
    type: n.kind === 'container' && hasChildren.has(n.id) ? 'container' : 'task',
    position: { x: 0, y: 0 },
    // Children can be moved and the container resized, but a task cannot be dragged
    // out of its container: that would change the package structure.
    ...(n.parent ? { parentId: n.parent, extent: 'parent' } : {}),
    data: { label: n.name, kind: n.kind, subtitle: subtitleOf(n), disabled: n.disabled },
  }))

  const edges = g.edges.map((e, i) => {
    const color = edgeColor[e.kind] ?? edgeColor.Success
    return {
      id: e.id ?? `e${i}`,
      source: e.from,
      target: e.to,
      label: e.kind === 'Success' ? (e.count > 1 ? `×${e.count}` : undefined) : e.kind,
      animated: e.kind === 'Failure',
      style: { stroke: color, strokeWidth: 2, strokeDasharray: e.kind === 'Failure' ? '6 4' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })

  return { nodes: layout(nodes, edges), edges }
}

// First view. A diagram that stays legible when fitted whole is fitted. A wide one would shrink to
// unreadable text, so it opens at a readable zoom at the left, where the run starts; the minimap and
// the fit button give the overview. Runs once, after every card has been measured.
function FitWhenReady() {
  const { fitView, getNodes, getNodesBounds, setViewport } = useReactFlow()
  const ready = useNodesInitialized()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current || !width || !height) return
    done.current = true
    const b = getNodesBounds(getNodes())
    const fits = Math.min(width / (b.width + 80), height / (b.height + 80))
    if (fits >= 0.6) {
      fitView({ padding: 0.12, maxZoom: 1 }) // never magnify a small diagram beyond 100%
      return
    }
    const zoom = 0.7
    setViewport({ x: 40 - b.x * zoom, y: (height - b.height * zoom) / 2 - b.y * zoom, zoom })
  }, [ready, width, height, fitView, getNodes, getNodesBounds, setViewport])
  return null
}

function Toolbar({ onReset }) {
  const { fitView } = useReactFlow()
  return (
    <Panel position="top-left" className="flex items-center gap-2 rounded-lg border bg-background/90 p-1.5 text-xs text-muted-foreground shadow-sm">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          onReset()
          setTimeout(() => fitView({ duration: 300 }), 50)
        }}
      >
        Re-layout
      </Button>
      <span className="px-1">Drag cards to move · select a container to resize</span>
    </Panel>
  )
}

export function FlowCanvas({ graph, layoutKey, selectedId, onSelect, onOpen }) {
  const { theme } = useTheme()
  const auto = useMemo(() => toFlow(graph), [graph])
  const [nodes, setNodes] = useState(() => applySaved(auto.nodes, loadLayout(layoutKey)))
  const touched = useRef(false) // true once the user has dragged or resized something

  const onNodesChange = useCallback((changes) => {
    // Selection is driven by the URL, so ignore React Flow's own select changes.
    const kept = changes.filter((c) => c.type !== 'select')
    if (kept.some((c) => (c.type === 'position' && c.dragging) || (c.type === 'dimensions' && c.resizing)))
      touched.current = true
    setNodes((ns) => applyNodeChanges(kept, ns))
  }, [])

  // Save shortly after the user stops moving things.
  useEffect(() => {
    if (!touched.current) return
    const t = setTimeout(() => saveLayout(layoutKey, nodes), 250)
    return () => clearTimeout(t)
  }, [nodes, layoutKey])

  const reset = useCallback(() => {
    clearLayout(layoutKey)
    touched.current = false
    setNodes(auto.nodes)
  }, [auto, layoutKey])

  const shown = useMemo(
    () => nodes.map((n) => (n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  )

  return (
    <ReactFlow
      nodes={shown}
      edges={auto.edges}
      nodeTypes={nodeTypes}
      colorMode={theme}
      minZoom={0.1}
      onNodesChange={onNodesChange}
      nodesConnectable={false}
      onNodeClick={(_, n) => onSelect?.(n.id)}
      onPaneClick={() => onSelect?.(null)}
      onNodeDoubleClick={(_, n) => onOpen?.(n.id)}
      zoomOnDoubleClick={false}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={(n) => `var(--kind-${n.type === 'container' ? 'container' : n.data?.kind === 'task' ? 'other' : n.data?.kind ?? 'other'})`} />
      <FitWhenReady />
      <Toolbar onReset={reset} />
    </ReactFlow>
  )
}
