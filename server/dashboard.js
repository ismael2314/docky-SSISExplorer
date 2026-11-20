// Summary across every package in the folder, for the dashboard page.
const strip = (s = '') => s.replace(/[[\]"]/g, '')
const norm = (s) => strip(s).toLowerCase()
const WRITES = new Set(['TRUNCATE', 'INSERT', 'DELETE', 'UPDATE', 'MERGE'])

const bump = (obj, key) => { obj[key] = (obj[key] ?? 0) + 1 }
const entries = (obj) => Object.entries(obj).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)

export function buildDashboard({ packages, connections, files }) {
  const all = [...packages.values()]
  const models = all.filter((e) => !e.error).map((e) => e.model)
  const failed = all.filter((e) => e.error).map((e) => ({ id: e.model.id, fileName: e.model.fileName, error: e.error }))
  const known = new Set(models.map((m) => m.id.toLowerCase()))

  const kinds = {}
  const sqlOps = {}
  const tables = new Map()      // normalised name -> { name, readBy:Set, writtenBy:Set }
  const procs = new Map()       // normalised name -> { name, packages:Set }
  const conns = new Map()       // connection id -> { ..., usedBy:Set }
  const missing = new Map()     // child id -> { name, referencedBy:Set }
  const calledBy = new Map()    // child id -> Set of packages that call it
  const mismatches = []
  let mappedColumns = 0

  const touchTable = (name, pkg, side) => {
    if (!name) return
    const k = norm(name)
    if (!tables.has(k)) tables.set(k, { name: strip(name), readBy: new Set(), writtenBy: new Set() })
    tables.get(k)[side].add(pkg)
  }
  const touchConn = (d, pkg) => {
    if (!d.connectionId) return
    const known = connections.get(d.connectionId)
    if (!conns.has(d.connectionId))
      conns.set(d.connectionId, {
        id: d.connectionId,
        name: d.connection ?? known?.name ?? null,
        type: known?.type,
        server: known?.server,
        database: known?.database,
        usedBy: new Set(),
      })
    const c = conns.get(d.connectionId)
    if (!c.name && d.connection) c.name = d.connection
    c.usedBy.add(pkg)
  }

  for (const m of models) {
    for (const n of m.nodes) {
      bump(kinds, n.kind)
      const d = n.details
      touchConn(d, m.id)
      if (n.kind === 'sql' && d.operation) {
        bump(sqlOps, d.operation)
        if (WRITES.has(d.operation)) touchTable(d.target, m.id, 'writtenBy')
        if (d.operation === 'EXEC' && d.target) {
          const k = norm(d.target)
          if (!procs.has(k)) procs.set(k, { name: strip(d.target), packages: new Set() })
          procs.get(k).packages.add(m.id)
        }
      }
      if (n.kind === 'package' && d.childPackageId) {
        const k = d.childPackageId.toLowerCase()
        if (!calledBy.has(k)) calledBy.set(k, new Set())
        calledBy.get(k).add(m.id)
        if (!known.has(k)) {
          if (!missing.has(k)) missing.set(k, { id: d.childPackageId, name: d.childPackage, referencedBy: new Set() })
          missing.get(k).referencedBy.add(m.id)
        }
      }
    }

    for (const [taskId, df] of Object.entries(m.dataFlows)) {
      for (const c of df.nodes) {
        touchConn(c.details, m.id)
        if (c.kind === 'source') touchTable(c.details.table, m.id, 'readBy')
        if (c.kind === 'destination') touchTable(c.details.table, m.id, 'writtenBy')
        for (const i of c.columns?.inputs ?? []) {
          if (!i.target) continue
          mappedColumns++
          if (i.mismatch)
            mismatches.push({
              package: m.id, taskId, component: c.id, componentName: c.name, column: i.target.column,
              from: i.from?.sqlType ?? i.from?.type, to: i.target.sqlType ?? i.target.type,
            })
        }
      }
    }
  }

  const connList = [...conns.values()].map((c) => ({ ...c, usedBy: [...c.usedBy] })).sort((a, b) => b.usedBy.length - a.usedBy.length)
  const tableList = [...tables.values()]
    .map((t) => ({ name: t.name, readBy: [...t.readBy], writtenBy: [...t.writtenBy] }))
    .sort((a, b) => b.readBy.length + b.writtenBy.length - (a.readBy.length + a.writtenBy.length) || a.name.localeCompare(b.name))

  const sum = (f) => models.reduce((s, m) => s + f(m), 0)
  const packageRows = models
    .map((m) => {
      const children = m.nodes.filter((n) => n.kind === 'package')
      return {
        id: m.id,
        name: m.name,
        tasks: m.stats.tasks,
        containers: m.stats.containers,
        dataFlows: m.stats.dataFlows,
        sqlTasks: m.stats.sqlTasks,
        variablesUsed: m.stats.variablesUsed,
        children: { total: children.length, missing: children.filter((c) => !known.has(String(c.details.childPackageId).toLowerCase())).length },
        entryPoint: !(calledBy.get(m.id.toLowerCase())?.size),
      }
    })
    .sort((a, b) => b.tasks - a.tasks || a.id.localeCompare(b.id))

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      packages: models.length,
      failed: failed.length,
      tasks: sum((m) => m.stats.tasks),
      containers: sum((m) => m.stats.containers),
      dataFlows: sum((m) => m.stats.dataFlows),
      sqlTasks: sum((m) => m.stats.sqlTasks),
      childLinks: sum((m) => m.stats.childPackages),
      variablesUsed: sum((m) => m.stats.variablesUsed),
      entryPoints: packageRows.filter((p) => p.entryPoint).length,
      connections: connList.length,
      connectionsUnnamed: connList.filter((c) => !c.name).length,
      tablesWritten: tableList.filter((t) => t.writtenBy.length).length,
      tablesRead: tableList.filter((t) => t.readBy.length).length,
      procedures: procs.size,
      mappedColumns,
      typeMismatches: mismatches.length,
    },
    kinds: entries(kinds).map(({ key, count }) => ({ kind: key, count })),
    sqlOps: entries(sqlOps).map(({ key, count }) => ({ op: key, count })),
    attention: {
      missingChildren: [...missing.values()].map((c) => ({ id: c.id, name: c.name, referencedBy: [...c.referencedBy] })),
      unnamedConnections: connList.filter((c) => !c.name).map((c) => ({ id: c.id, usedBy: c.usedBy })),
      failed,
      mismatches: mismatches.slice(0, 8),
    },
    packages: packageRows,
    tables: tableList,
    procedures: [...procs.values()].map((p) => ({ name: p.name, packages: [...p.packages] })),
    connections: connList,
    recentFiles: [...files].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 6),
  }
}
