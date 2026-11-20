// Everything that touches the packages folder and the settings file.
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConmgr, parseDtsx } from './dtsx.js'
import { extractIspac } from './ispac.js'
import { HttpError } from './errors.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PACKAGES_DIR = path.resolve(process.env.PACKAGES_DIR ?? path.join(here, 'packages'))
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(here, 'data'))
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

// SSIS saves UTF-8 (usually with a BOM); some tools write UTF-16.
export function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  return buf.toString('utf8').replace(/^\uFEFF/, '')
}

// ---------- file names ----------
const ALLOWED = ['.dtsx', '.conmgr', '.ispac']

export function safeName(name) {
  const n = String(name ?? '')
  if (!n || n.length > 180 || n !== path.basename(n) || /[\\/:*?"<>|\x00-\x1f]/.test(n) || n.startsWith('.'))
    throw new HttpError(400, `Invalid file name: ${n.slice(0, 60)}`)
  if (!ALLOWED.includes(path.extname(n).toLowerCase()))
    throw new HttpError(400, 'Only .dtsx, .conmgr and .ispac files are accepted')
  return n
}

// ---------- loading (re-parses a file only when it changes on disk) ----------
const cache = new Map() // fileName -> { stamp, kind, model | conn | error }

export async function loadAll() {
  await mkdir(PACKAGES_DIR, { recursive: true })
  const packages = new Map()    // lower-case id -> { model | error }
  const connections = new Map() // GUID -> conn
  const files = []

  for (const f of (await readdir(PACKAGES_DIR)).sort((a, b) => a.localeCompare(b))) {
    const ext = path.extname(f).toLowerCase()
    if (ext !== '.dtsx' && ext !== '.conmgr') continue
    const st = await stat(path.join(PACKAGES_DIR, f))
    const stamp = `${st.mtimeMs}:${st.size}`
    let entry = cache.get(f)
    if (!entry || entry.stamp !== stamp) {
      entry = { stamp, kind: ext === '.dtsx' ? 'package' : 'connection' }
      try {
        const xml = decodeText(await readFile(path.join(PACKAGES_DIR, f)))
        if (ext === '.dtsx') entry.model = parseDtsx(xml, f)
        else entry.conn = parseConmgr(xml, f)
      } catch (err) {
        entry.error = err.message
        if (ext === '.dtsx') entry.model = { id: f.replace(/\.dtsx$/i, ''), fileName: f }
      }
      cache.set(f, entry)
    }

    files.push({
      name: f, type: entry.kind, size: st.size, modified: st.mtime.toISOString(),
      ...(entry.error ? { error: entry.error } : {}),
    })
    if (entry.kind === 'package') packages.set(entry.model.id.toLowerCase(), entry)
    else if (entry.conn?.id) connections.set(entry.conn.id, entry.conn)
  }
  return { packages, connections, files }
}

// ---------- writing ----------
async function saveOne(name, buffer, overwrite) {
  try {
    const safe = safeName(name)
    const xml = decodeText(buffer)
    // Validate before touching the disk.
    if (safe.toLowerCase().endsWith('.dtsx')) parseDtsx(xml, safe)
    else parseConmgr(xml, safe)

    await mkdir(PACKAGES_DIR, { recursive: true })
    // Windows file systems ignore case, so match an existing file regardless of case.
    const existing = (await readdir(PACKAGES_DIR)).find((f) => f.toLowerCase() === safe.toLowerCase())
    if (existing && !overwrite) return { name: safe, status: 'exists' }
    await writeFile(path.join(PACKAGES_DIR, existing ?? safe), buffer)
    return { name: safe, status: existing ? 'replaced' : 'added' }
  } catch (err) {
    return { name, status: 'error', error: err.message }
  }
}

// One upload: a .dtsx, a .conmgr, or an .ispac that expands into several files.
export async function saveUpload(name, buffer, { overwrite = false } = {}) {
  const safe = safeName(name)
  if (path.extname(safe).toLowerCase() === '.ispac') {
    const parts = extractIspac(buffer)
    if (!parts.length)
      return [{ name: safe, status: 'error', error: 'No .dtsx or .conmgr files found inside this project file' }]
    const out = []
    for (const p of parts) out.push(await saveOne(p.name, p.data, overwrite))
    return out
  }
  return [await saveOne(safe, buffer, overwrite)]
}

export async function deleteFile(name) {
  const safe = safeName(name)
  const existing = (await readdir(PACKAGES_DIR)).find((f) => f.toLowerCase() === safe.toLowerCase())
  if (!existing) throw new HttpError(404, `File '${safe}' not found`)
  await unlink(path.join(PACKAGES_DIR, existing))
}

// ---------- settings (never contains the password) ----------
const DEFAULT_SETTINGS = {
  sql: { server: '', port: '', database: 'SSISDB', authType: 'sql', user: '', domain: '', encrypt: true, trustServerCertificate: false },
}

export async function getSettings() {
  try {
    const saved = JSON.parse(await readFile(SETTINGS_FILE, 'utf8'))
    return { sql: { ...DEFAULT_SETTINGS.sql, ...saved.sql } }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max)

export function cleanSqlSettings(s = {}) {
  const port = str(s.port, 5)
  if (port && !/^\d+$/.test(port)) throw new HttpError(400, 'Port must be a number')
  return {
    server: str(s.server),
    port,
    database: str(s.database) || 'SSISDB',
    authType: s.authType === 'windows' ? 'windows' : 'sql',
    user: str(s.user),
    domain: str(s.domain),
    encrypt: s.encrypt !== false,
    trustServerCertificate: s.trustServerCertificate === true,
  }
}

export async function saveSettings(body) {
  const next = { sql: cleanSqlSettings(body?.sql) }
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2))
  return next
}
