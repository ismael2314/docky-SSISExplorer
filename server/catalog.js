// Reads the SSIS catalog (SSISDB) of a SQL Server and downloads project files from it.
// Uses the pure-JavaScript `mssql`/tedious driver: nothing to install on the machine.
import sql from 'mssql'
import { HttpError } from './errors.js'
import { cleanSqlSettings } from './store.js'

export function toConfig(raw, password) {
  const c = cleanSqlSettings(raw)
  if (!c.server) throw new HttpError(400, 'Server is required')
  const pwd = password || process.env.DOCKY_SQL_PASSWORD || ''

  // HOST\INSTANCE -> host + instance name (a port is not used with named instances)
  let server = c.server
  let instanceName
  const m = /^([^\\]+)\\(.+)$/.exec(server)
  if (m) { server = m[1]; instanceName = m[2] }

  return {
    server,
    database: c.database,
    user: c.user,
    password: pwd,
    ...(c.port && !instanceName ? { port: Number(c.port) } : {}),
    // Windows login from Node means NTLM with an explicit domain, user and password.
    ...(c.authType === 'windows' ? { domain: c.domain } : {}),
    connectionTimeout: 10000,
    requestTimeout: 120000,
    options: {
      encrypt: c.encrypt,
      trustServerCertificate: c.trustServerCertificate,
      ...(instanceName ? { instanceName } : {}),
    },
  }
}

function friendly(err) {
  const msg = err?.message ?? String(err)
  if (err?.code === 'ELOGIN') return `Login failed: ${msg}`
  if (['ESOCKET', 'ETIMEOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(err?.code) || /ENOTFOUND|ECONNREFUSED|timeout/i.test(msg))
    return `Could not reach the server: ${msg}`
  if (/permission|denied/i.test(msg)) return `The login is not allowed to do that: ${msg}`
  return msg
}

export async function withPool(conn, password, fn) {
  const pool = new sql.ConnectionPool(toConfig(conn, password))
  pool.on('error', () => {}) // surfaced through the failing call instead
  try {
    await pool.connect()
    return await fn(pool)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, friendly(err))
  } finally {
    await pool.close().catch(() => {})
  }
}

export async function testConnection(conn, password) {
  try {
    return await withPool(conn, password, async (pool) => {
      const r = await pool.request().query(
        'SELECT @@VERSION AS version, DB_NAME() AS db, OBJECT_ID(N\'catalog.projects\') AS cat',
      )
      const row = r.recordset[0]
      return {
        ok: true,
        version: String(row.version).split('\n')[0].trim(),
        database: row.db,
        isCatalog: row.cat != null,
      }
    })
  } catch (err) {
    if (err instanceof HttpError && err.status !== 400) return { ok: false, error: err.message }
    throw err
  }
}

export async function listCatalog(conn, password) {
  return withPool(conn, password, async (pool) => {
    const r = await pool.request().query(`
      SELECT f.name AS folder, p.name AS project, p.last_deployed_time AS deployed,
             p.deployed_by_name AS deployedBy, pk.name AS package
      FROM catalog.folders f
      JOIN catalog.projects p ON p.folder_id = f.folder_id
      LEFT JOIN catalog.packages pk ON pk.project_id = p.project_id
      ORDER BY f.name, p.name, pk.name`)
    const projects = new Map()
    for (const row of r.recordset) {
      const key = `${row.folder}\u0000${row.project}`
      if (!projects.has(key))
        projects.set(key, { folder: row.folder, project: row.project, deployed: row.deployed, deployedBy: row.deployedBy, packages: [] })
      if (row.package) projects.get(key).packages.push(row.package)
    }
    return [...projects.values()]
  })
}

// catalog.get_project returns the whole project as one binary value (the .ispac zip).
export async function fetchProject(conn, password, folder, project) {
  return withPool(conn, password, async (pool) => {
    const r = await pool
      .request()
      .input('f', sql.NVarChar(128), folder)
      .input('p', sql.NVarChar(128), project)
      .query('EXEC catalog.get_project @folder_name = @f, @project_name = @p')
    const row = r.recordset?.[0]
    const val = row && Object.values(row)[0]
    const buf = Array.isArray(val) ? val[0] : val
    if (!Buffer.isBuffer(buf)) throw new HttpError(502, `The catalog returned no project file for ${folder}/${project}`)
    return buf
  })
}
