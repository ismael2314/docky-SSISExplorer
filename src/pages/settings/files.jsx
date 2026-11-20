import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Plug, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/page'
import { Badge, Notice } from '@/components/form'
import { deleteFile, listConnections, listFiles, notifyFilesChanged } from '@/lib/api'

const kb = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export function FilesTab({ refreshKey }) {
  const [data, setData] = useState(null)
  const [conns, setConns] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    Promise.all([listFiles(), listConnections()])
      .then(([f, c]) => { setData(f); setConns(c); setError(null) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load, refreshKey])

  async function remove(name) {
    if (!window.confirm(`Delete ${name} from the packages folder? This cannot be undone.`)) return
    try {
      await deleteFile(name)
      notifyFilesChanged()
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const packages = data?.files.filter((f) => f.type === 'package') ?? []

  return (
    <div className="grid h-full gap-6 xl:grid-cols-2">
      <Card
        title="Packages"
        description={data ? `${packages.length} in ${data.folder}` : 'Loading…'}
        bodyClassName="p-0"
      >
        {error && <div className="p-4"><Notice tone="error">{error}</Notice></div>}
        {data && packages.length === 0 && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <Package className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Nothing yet. Upload files or import from the SQL Server catalog.</p>
          </div>
        )}
        <ul className="divide-y">
          {packages.map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="kind-chip kind-package flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Package className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                {f.error ? (
                  <span className="font-medium">{f.name}</span>
                ) : (
                  <Link className="font-medium hover:text-primary hover:underline" to={`/packages/${encodeURIComponent(f.name.replace(/\.dtsx$/i, ''))}`}>
                    {f.name}
                  </Link>
                )}
                <div className="text-xs text-muted-foreground">{kb(f.size)} · {new Date(f.modified).toLocaleString()}</div>
                {f.error && <div className="text-xs text-error">Could not read: {f.error}</div>}
              </div>
              <Button size="sm" variant="ghost" className="text-error hover:bg-destructive/10" onClick={() => remove(f.name)} aria-label={`Delete ${f.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Project connections"
        description="From .conmgr files. They give names to the connection IDs that packages refer to. Passwords are hidden."
        bodyClassName="p-0"
      >
        {conns.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <Plug className="h-8 w-8 text-muted-foreground/60" />
            <p className="max-w-sm text-sm text-muted-foreground">None yet. Upload the project&apos;s .conmgr files (or its .ispac) to see connection names in your packages.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {conns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="kind-chip kind-sql flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Plug className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge tone="info">{c.type}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{[c.server, c.database].filter(Boolean).join(' / ') || c.fileName}</div>
                </div>
                <span className="hidden text-xs text-muted-foreground lg:block">{c.fileName}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
