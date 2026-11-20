// The full call tree of one package: its tasks in execution order, and wherever an
// Execute Package Task calls another package that is in the folder, that package's tree nested inside.
const MAX_NODES = 4000 // safety net for very large or heavily repeated hierarchies

const strip = (s = '') => s.replace(/[[\]"]/g, '')
const plural = (n, one) => `${n} ${n === 1 ? one : one + 's'}`

// Order siblings by their precedence constraints (stable: file order breaks ties).
function inRunOrder(kids, edges) {
  const index = new Map(kids.map((k, i) => [k.id, i]))
  const incoming = new Map(kids.map((k) => [k.id, 0]))
  for (const e of edges) incoming.set(e.to, incoming.get(e.to) + 1)
  const ready = kids.filter((k) => incoming.get(k.id) === 0)
  const out = []
  while (ready.length) {
    ready.sort((a, b) => index.get(a.id) - index.get(b.id))
    const k = ready.shift()
    out.push(k)
    for (const e of edges)
      if (e.from === k.id) {
        incoming.set(e.to, incoming.get(e.to) - 1)
        if (incoming.get(e.to) === 0) ready.push(kids[index.get(e.to)])
      }
  }
  for (const k of kids) if (!out.includes(k)) out.push(k) // anything left over (should not happen)
  return out
}

function summaryOf(n, model) {
  const d = n.details ?? {}
  if (n.kind === 'sql') return d.operation ? `${d.operation} ${strip(d.target ?? '')}`.trim() : n.typeLabel
  if (n.kind === 'dataflow') {
    const comps = model.dataFlows[n.id]?.nodes ?? []
    const from = comps.filter((c) => c.kind === 'source').map((c) => (c.details.table ? strip(c.details.table) : 'SQL query'))
    const to = comps.filter((c) => c.kind === 'destination').map((c) => (c.details.table ? strip(c.details.table) : 'SQL command'))
    return from.length || to.length ? `${from.join(', ') || '?'} → ${to.join(', ') || '?'}` : n.typeLabel
  }
  return n.typeLabel
}

export function buildHierarchy(rootId, packages) {
  const find = (id) => {
    const e = packages.get(String(id).toLowerCase())
    return e && !e.error ? e.model : null
  }
  const root = find(rootId)
  if (!root) return null

  let counter = 0
  const key = () => ++counter
  const distinct = new Map()        // lower id -> model
  const missing = new Map()         // lower id -> written name
  const graphNodes = new Map()      // lower id -> node
  const graphEdges = new Map()      // "from>to" -> edge
  let loops = 0
  let maxDepth = 0
  let truncated = false

  const graphNode = (id, model, writtenName) => {
    const k = id.toLowerCase()
    if (!graphNodes.has(k))
      graphNodes.set(k, {
        id: model?.id ?? writtenName ?? id,
        name: model?.id ?? writtenName ?? id,
        type: 'Package',
        typeLabel: 'Package',
        kind: 'package',
        parent: null,
        disabled: false,
        subtitle: model ? `${plural(model.stats.tasks, 'task')} · ${plural(model.stats.dataFlows, 'data flow')}` : 'not uploaded',
        details: { childPackage: writtenName ?? id, childResolved: !!model },
      })
    return graphNodes.get(k).id
  }
  const graphEdge = (from, to) => {
    const k = `${from}>${to}`.toLowerCase()
    if (!graphEdges.has(k)) graphEdges.set(k, { id: k, from, to, kind: 'Success', count: 0 })
    graphEdges.get(k).count++
  }

  function packageNode(childId, writtenName, path, depth, callerId) {
    const model = find(childId)
    const lower = String(childId).toLowerCase()
    const calleeId = graphNode(childId, model, writtenName?.replace(/\.dtsx$/i, ''))
    if (callerId) graphEdge(callerId, calleeId)

    if (!model) {
      missing.set(lower, writtenName ?? childId)
      return { key: key(), resolved: false, packageId: childId, name: writtenName ?? childId }
    }
    if (path.includes(lower)) {
      loops++
      return { key: key(), resolved: true, cycle: true, packageId: model.id, name: model.id }
    }
    if (counter > MAX_NODES) {
      truncated = true
      return { key: key(), resolved: true, truncated: true, packageId: model.id, name: model.id }
    }
    distinct.set(lower, model)
    maxDepth = Math.max(maxDepth, depth)
    return {
      key: key(),
      resolved: true,
      packageId: model.id,
      name: model.id,
      internalName: model.name,
      stats: model.stats,
      children: executables(model, null, [...path, lower], depth),
    }
  }

  function executables(model, parentId, path, depth) {
    const kids = model.nodes.filter((n) => n.parent === parentId)
    const ids = new Set(kids.map((k) => k.id))
    const edges = model.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
    const byId = new Map(kids.map((k) => [k.id, k]))

    // Tasks come out in run order, so every task a task follows already has its key.
    const keyOf = new Map()
    return inRunOrder(kids, edges).map((n) => {
      const runsAfter = []
      for (const e of edges) {
        if (e.to !== n.id) continue
        const k = keyOf.get(e.from)
        if (k != null && !runsAfter.some((a) => a.key === k && a.kind === e.kind))
          runsAfter.push({ key: k, name: byId.get(e.from).name, kind: e.kind })
      }
      const node = {
        key: key(),
        id: n.id,
        packageId: model.id,
        name: n.name,
        kind: n.kind,
        typeLabel: n.typeLabel,
        disabled: n.disabled,
        summary: summaryOf(n, model),
        runsAfter, // the sibling tasks this one runs after, with the constraint type
        children: [],
      }
      keyOf.set(n.id, node.key)
      if (n.kind === 'container') node.children = executables(model, n.id, path, depth)
      if (n.kind === 'package')
        node.call = packageNode(n.details.childPackageId, n.details.childPackage, path, depth + 1, model.id)
      return node
    })
  }

  graphNode(root.id, root)
  const tree = packageNode(root.id, root.id, [], 0, null)

  const models = [...distinct.values()]
  const sum = (f) => models.reduce((s, m) => s + f(m), 0)
  return {
    root: tree,
    graph: { nodes: [...graphNodes.values()], edges: [...graphEdges.values()] },
    summary: {
      packages: models.length,
      missing: missing.size,
      missingNames: [...missing.values()],
      loops,
      levels: maxDepth + 1,
      tasks: sum((m) => m.stats.tasks),
      dataFlows: sum((m) => m.stats.dataFlows),
      sqlTasks: sum((m) => m.stats.sqlTasks),
      truncated,
    },
  }
}
