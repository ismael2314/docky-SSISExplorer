import { useEffect, useMemo, useState } from 'react'
import { Database, Download, FolderOpen, Plug, RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/page'
import { Badge, Check, Field, Notice, inputClass } from '@/components/form'
import { catalogImport, catalogProjects, catalogTest, getSettings, notifyFilesChanged, saveSettings } from '@/lib/api'
import { setSession } from '@/lib/sqlSession'

const EMPTY = {
  server: '', port: '', database: 'SSISDB', authType: 'sql', user: '', domain: '',
  encrypt: true, trustServerCertificate: false,
}

const keyOf = (p) => `${p.folder}\u0000${p.project}`

export function SqlTab({ onImported }) {
  const [conn, setConn] = useState(EMPTY)
  const [password, setPassword] = useState('') // lives in this component and the in-memory session only
  const [msg, setMsg] = useState(null)         // { tone, text }
  const [busy, setBusy] = useState(null)       // 'save' | 'test' | 'browse' | 'import'
  const [projects, setProjects] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [imported, setImported] = useState(null)

  useEffect(() => {
    getSettings().then((s) => setConn({ ...EMPTY, ...s.sql })).catch(() => {})
  }, [])

  const set = (k) => (v) => setConn((c) => ({ ...c, [k]: v }))
  const text = (k) => ({ value: conn[k], onChange: (e) => set(k)(e.target.value), className: inputClass })

  async function run(name, fn) {
    setBusy(name)
    setMsg(null)
    try { await fn() } catch (e) { setMsg({ tone: 'error', text: e.message }) } finally { setBusy(null) }
  }

  // Remember the login for this browser session so the Jobs page can use it too.
  const remember = () => setSession({ connection: conn, password })

  const save = () => run('save', async () => {
    await saveSettings(conn)
    setMsg({ tone: 'ok', text: 'Connection settings saved. The password is not saved.' })
  })

  const test = () => run('test', async () => {
    const r = await catalogTest(conn, password)
    if (!r.ok) return setMsg({ tone: 'error', text: r.error })
    remember()
    setMsg(
      r.isCatalog
        ? { tone: 'ok', text: `Connected to ${r.database}. ${r.version}` }
        : { tone: 'warn', text: `Connected to ${r.database}, but it has no SSIS catalog (catalog.projects). Is the database name SSISDB?` },
    )
  })

  const browse = () => run('browse', async () => {
    const list = await catalogProjects(conn, password)
    remember()
    setProjects(list)
    setPicked(new Set())
    setImported(null)
    if (!list.length) setMsg({ tone: 'warn', text: 'The catalog has no deployed projects.' })
  })

  const doImport = () => run('import', async () => {
    const chosen = projects.filter((p) => picked.has(keyOf(p))).map(({ folder, project }) => ({ folder, project }))
    const r = await catalogImport(conn, password, chosen)
    setImported(r.projects)
    onImported?.()
    notifyFilesChanged()
  })

  const byFolder = useMemo(() => {
    const m = new Map()
    for (const p of projects ?? []) {
      if (!m.has(p.folder)) m.set(p.folder, [])
      m.get(p.folder).push(p)
    }
    return [...m.entries()]
  }, [projects])

  const toggle = (p) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(keyOf(p)) ? n.delete(keyOf(p)) : n.add(keyOf(p))
      return n
    })

  const disabled = !!busy || !conn.server

  return (
    <div className="grid h-full gap-6 xl:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
      <Card
        title="Connection"
        description="Used to read the SSIS catalog and the SQL Server Agent jobs."
        footer={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={disabled} onClick={save}><Save className="mr-1.5 h-4 w-4" />{busy === 'save' ? 'Saving…' : 'Save'}</Button>
            <Button disabled={disabled} onClick={test}><Plug className="mr-1.5 h-4 w-4" />{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-6 gap-3">
          <Field label="Server" hint="host, host\INSTANCE or host,port" className="col-span-4">
            <input {...text('server')} placeholder="SQL01\PROD" autoComplete="off" />
          </Field>
          <Field label="Port" className="col-span-2">
            <input {...text('port')} inputMode="numeric" placeholder="1433" />
          </Field>
          <Field label="Catalog database" className="col-span-6">
            <input {...text('database')} placeholder="SSISDB" />
          </Field>
          <Field label="Sign in with" className="col-span-6">
            <select {...text('authType')} onChange={(e) => set('authType')(e.target.value)}>
              <option value="sql">SQL Server login</option>
              <option value="windows">Windows login (domain)</option>
            </select>
          </Field>
          {conn.authType === 'windows' && (
            <Field label="Domain" className="col-span-6">
              <input {...text('domain')} placeholder="CONTOSO" />
            </Field>
          )}
          <Field label="User name" className="col-span-3">
            <input {...text('user')} autoComplete="off" />
          </Field>
          <Field label="Password" className="col-span-3">
            <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <p className="col-span-6 -mt-1 text-xs text-muted-foreground">
            The password is never saved. It is kept in memory for this browser session so the Jobs page can use it.
          </p>
          <div className="col-span-6 space-y-2.5 border-t pt-4">
            <Check label="Encrypt the connection" checked={conn.encrypt} onChange={set('encrypt')} />
            <Check
              label="Trust the server certificate"
              hint="Needed for self-signed certificates, common on internal servers."
              checked={conn.trustServerCertificate}
              onChange={set('trustServerCertificate')}
            />
          </div>
          {msg && <div className="col-span-6"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        </div>
      </Card>

      <Card
        title="SSIS catalog"
        description={projects ? `${projects.length} deployed project${projects.length === 1 ? '' : 's'}` : 'Deployed projects you can import and document.'}
        action={
          <Button variant="outline" size="sm" disabled={disabled} onClick={browse}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy === 'browse' ? 'animate-spin' : ''}`} />
            {projects ? 'Refresh' : 'Browse catalog'}
          </Button>
        }
        bodyClassName="p-0"
        footer={
          projects?.length ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!!busy || picked.size === 0} onClick={doImport}>
                <Download className="mr-1.5 h-4 w-4" />
                {busy === 'import' ? 'Importing…' : `Import ${picked.size || ''} selected`}
              </Button>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setPicked(picked.size === projects.length ? new Set() : new Set(projects.map(keyOf)))}
              >
                {picked.size === projects.length ? 'Clear selection' : 'Select all'}
              </button>
              <span className="text-xs text-muted-foreground">Packages with the same file name are replaced.</span>
            </div>
          ) : null
        }
      >
        {!projects ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Database className="h-7 w-7" /></span>
            <div className="text-sm font-medium">Connect to see your deployed projects</div>
            <p className="max-w-sm text-sm text-muted-foreground">Fill in the connection, then choose Browse catalog. You can import whole projects with their packages and connection managers.</p>
          </div>
        ) : (
          <div>
            {byFolder.map(([folder, items]) => (
              <div key={folder}>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/80 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {folder}
                </div>
                {items.map((p) => (
                  <label key={keyOf(p)} className="flex cursor-pointer items-start gap-3 border-b px-5 py-3 text-sm hover:bg-muted/40">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={picked.has(keyOf(p))} onChange={() => toggle(p)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{p.project}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.packages.length} packages{p.deployed && ` · deployed ${new Date(p.deployed).toLocaleDateString()}`}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.packages.join(', ')}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
            {imported && (
              <ul className="space-y-2 border-b bg-muted/30 px-5 py-3 text-sm">
                {imported.map((p) => {
                  const count = (s) => p.results?.filter((r) => r.status === s).length ?? 0
                  return (
                    <li key={keyOf(p)} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.folder} / {p.project}</span>
                      {p.error ? <Badge tone="error">{p.error}</Badge> : (
                        <>
                          {count('added') > 0 && <Badge tone="ok">{count('added')} added</Badge>}
                          {count('replaced') > 0 && <Badge tone="info">{count('replaced')} replaced</Badge>}
                          {count('error') > 0 && <Badge tone="error">{count('error')} failed</Badge>}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
