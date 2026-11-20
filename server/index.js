import express from 'express'
import { fetchProject, listCatalog, testConnection } from './catalog.js'
import { buildDashboard } from './dashboard.js'
import { buildHierarchy } from './hierarchy.js'
import { listJobs } from './jobs.js'
import { HttpError } from './errors.js'
import { extractIspac } from './ispac.js'
import {
  PACKAGES_DIR, deleteFile, getSettings, loadAll, saveSettings, saveUpload,
} from './store.js'

const PORT = Number(process.env.PORT ?? 5000)
// Local only by default. There is no login yet, so do not expose this to a network.
const HOST = process.env.HOST ?? '127.0.0.1'

const app = express()
app.use(express.json({ limit: '1mb' }))

const has = (all, id) => all.packages.has(String(id).toLowerCase())

// Add what only the whole folder knows: is the child package here, what is this connection called?
function enrich(node, all, connections) {
  const d = { ...node.details }
  if (node.kind === 'package') d.childResolved = has(all, d.childPackageId)
  if (d.connectionId && !d.connection) {
    const c = connections.get(d.connectionId)
    if (c) d.connection = c.name
  }
  return { ...node, details: d }
}

async function find(req) {
  const all = await loadAll()
  const entry = all.packages.get(String(req.params.id).toLowerCase())
  if (!entry) throw new HttpError(404, `Package '${req.params.id}' not found`)
  if (entry.error) throw new HttpError(422, entry.error)
  return { model: entry.model, all }
}

// ---------- packages ----------
app.get('/api/packages', async (_req, res) => {
  const all = await loadAll()
  // An entry point is a package that no other package in the folder calls.
  const called = new Set()
  for (const { model, error } of all.packages.values())
    if (!error) for (const n of model.nodes) if (n.kind === 'package') called.add(String(n.details.childPackageId).toLowerCase())
  res.json(
    [...all.packages.values()].map(({ model, error }) =>
      error
        ? { id: model.id, fileName: model.fileName, error }
        : {
            id: model.id,
            fileName: model.fileName,
            name: model.name,
            stats: model.stats,
            entryPoint: !called.has(model.id.toLowerCase()),
            childPackages: model.nodes
              .filter((n) => n.kind === 'package')
              .map((n) => ({ name: n.details.childPackage, resolved: has(all, n.details.childPackageId) })),
          },
    ),
  )
})

app.get('/api/packages/:id', async (req, res) => {
  const { model, all } = await find(req)
  const { nodes, edges, dataFlows, connections: own, ...summary } = model

  // Every connection the package refers to, named from the package itself or from the .conmgr files.
  const ids = new Set()
  for (const n of [...nodes, ...Object.values(dataFlows).flatMap((d) => d.nodes)])
    if (n.details.connectionId) ids.add(n.details.connectionId)
  const connections = [...ids].map((id) => {
    const inPackage = own.find((c) => c.id === id)
    const project = all.connections.get(id)
    return {
      id,
      name: project?.name ?? inPackage?.name ?? null,
      type: project?.type ?? inPackage?.type,
      server: project?.server,
      database: project?.database,
      scope: project ? 'project' : inPackage?.scope,
      resolved: !!(project ?? inPackage),
    }
  })
  res.json({ ...summary, connections })
})

app.get('/api/packages/:id/hierarchy', async (req, res) => {
  const { all } = await find(req)
  res.json(buildHierarchy(req.params.id, all.packages))
})

app.get('/api/packages/:id/flow', async (req, res) => {
  const { model, all } = await find(req)
  res.json({ nodes: model.nodes.map((n) => enrich(n, all, all.connections)), edges: model.edges })
})

// ?task=<refId of the Data Flow Task>  (refIds contain backslashes/spaces, so it is a query param)
app.get('/api/packages/:id/dataflow', async (req, res) => {
  const { model, all } = await find(req)
  const df = model.dataFlows[String(req.query.task)]
  if (!df) throw new HttpError(404, 'Data flow task not found')
  res.json({ nodes: df.nodes.map((n) => enrich(n, all, all.connections)), edges: df.edges })
})

// ---------- dashboard ----------
app.get('/api/dashboard', async (_req, res) => {
  res.json(buildDashboard(await loadAll()))
})

// ---------- files (upload / list / delete) ----------
app.get('/api/files', async (_req, res) => {
  const { files } = await loadAll()
  res.json({ folder: PACKAGES_DIR, files })
})

// Raw body upload: PUT /api/files/<name>?overwrite=1  (accepts .dtsx, .conmgr, .ispac)
app.put('/api/files/:name', express.raw({ type: () => true, limit: '100mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Empty file')
  const results = await saveUpload(req.params.name, req.body, { overwrite: req.query.overwrite === '1' })
  res.json({ results })
})

app.delete('/api/files/:name', async (req, res) => {
  await deleteFile(req.params.name)
  res.status(204).end()
})

app.get('/api/connections', async (_req, res) => {
  const { connections } = await loadAll()
  res.json([...connections.values()])
})

// ---------- settings ----------
app.get('/api/settings', async (_req, res) => {
  // sqlPasswordFromEnv tells the UI it can read jobs without asking for a password.
  res.json({ ...(await getSettings()), packagesFolder: PACKAGES_DIR, sqlPasswordFromEnv: !!process.env.DOCKY_SQL_PASSWORD })
})
app.put('/api/settings', async (req, res) => {
  res.json(await saveSettings(req.body))
})

// ---------- SQL Server catalog (SSISDB) ----------
// The password is only used for the request. It is never stored or sent back.
app.post('/api/catalog/test', async (req, res) => {
  res.json(await testConnection(req.body?.connection, req.body?.password))
})
app.post('/api/catalog/projects', async (req, res) => {
  res.json(await listCatalog(req.body?.connection, req.body?.password))
})
app.post('/api/catalog/import', async (req, res) => {
  const { connection, password, projects } = req.body ?? {}
  if (!Array.isArray(projects) || !projects.length) throw new HttpError(400, 'Choose at least one project')
  const out = []
  for (const { folder, project } of projects) {
    try {
      const ispac = await fetchProject(connection, password, folder, project)
      const files = extractIspac(ispac)
      const results = []
      for (const f of files) results.push(...(await saveUpload(f.name, f.data, { overwrite: true })))
      out.push({ folder, project, results })
    } catch (err) {
      out.push({ folder, project, error: err.message })
    }
  }
  res.json({ projects: out })
})

// ---------- SQL Server Agent jobs ----------
app.post('/api/jobs', async (req, res) => {
  const result = await listJobs(req.body?.connection, req.body?.password)
  const { packages } = await loadAll()
  // Mark the SSIS packages a job runs that are also documented here, so the UI can link to them.
  for (const job of result.jobs)
    for (const step of job.steps)
      if (step.package) {
        const entry = packages.get(step.package.name.toLowerCase())
        step.package.known = !!entry && !entry.error
        if (step.package.known) step.package.id = entry.model.id
      }
  res.json(result)
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }))
app.use((err, _req, res, _next) => {
  if (!(err instanceof HttpError)) console.error(err)
  res.status(err.status ?? 500).json({ error: err.message })
})

app.listen(PORT, HOST, () => console.log(`Docky API on http://${HOST}:${PORT}  (packages: ${PACKAGES_DIR})`))
