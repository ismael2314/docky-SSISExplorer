import dagre from '@dagrejs/dagre'

export const NODE_W = 220
export const NODE_H = 64
const PAD = 24     // space between a container's border and its children
const HEADER = 36  // room for the container title

// Lays out nodes left-to-right. Nodes that have children become containers:
// their children are laid out first, the container is sized to fit them, and
// then the container is placed among its own siblings.
// Input nodes may carry `parentId`; output is ordered parents-first, which React Flow requires.
export function layout(nodes, edges) {
  const kids = new Map()
  for (const n of nodes) {
    const key = n.parentId ?? ''
    if (!kids.has(key)) kids.set(key, [])
    kids.get(key).push(n)
  }

  const size = new Map() // id -> {w, h}
  const pos = new Map()  // id -> {x, y} relative to its parent's content area

  function measure(parentId) {
    const list = kids.get(parentId) ?? []
    if (!list.length) return { w: 0, h: 0 }

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 })

    const ids = new Set(list.map((n) => n.id))
    for (const n of list) {
      const inner = kids.has(n.id) ? measure(n.id) : null
      const s = inner
        ? { w: Math.max(inner.w + PAD * 2, NODE_W), h: inner.h + PAD * 2 + HEADER }
        : { w: NODE_W, h: NODE_H }
      size.set(n.id, s)
      g.setNode(n.id, { width: s.w, height: s.h })
    }
    // Precedence constraints only ever connect siblings, so edges stay within one level.
    for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target)

    dagre.layout(g)
    for (const n of list) {
      const p = g.node(n.id)
      const s = size.get(n.id)
      pos.set(n.id, { x: p.x - s.w / 2, y: p.y - s.h / 2 })
    }
    const { width, height } = g.graph()
    return { w: width, h: height }
  }

  measure('')

  const out = []
  function emit(parentId) {
    const offset = parentId ? { x: PAD, y: PAD + HEADER } : { x: 0, y: 0 }
    for (const n of kids.get(parentId) ?? []) {
      const p = pos.get(n.id)
      const s = size.get(n.id)
      const isContainer = kids.has(n.id)
      out.push({
        ...n,
        position: { x: p.x + offset.x, y: p.y + offset.y },
        ...(isContainer ? { width: s.w, height: s.h } : {}),
      })
      emit(n.id)
    }
  }
  emit('')
  return out
}
