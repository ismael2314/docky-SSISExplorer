import { useRef, useState } from 'react'
import { FileArchive, FilePlus2, Plug, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/page'
import { Badge, Check } from '@/components/form'
import { notifyFilesChanged, uploadFile } from '@/lib/api'

const STATUS = {
  added: { tone: 'ok', text: 'Added' },
  replaced: { tone: 'info', text: 'Replaced' },
  exists: { tone: 'warn', text: 'Already exists' },
  error: { tone: 'error', text: 'Failed' },
}

const FORMATS = [
  { icon: FilePlus2, name: '.dtsx', text: 'A single SSIS package.' },
  { icon: Plug, name: '.conmgr', text: 'A project connection manager. Gives names to connection IDs.' },
  { icon: FileArchive, name: '.ispac', text: 'A whole deployed project. Unpacked into its packages and connections.' },
]

export function UploadTab({ onChanged }) {
  const input = useRef(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [rows, setRows] = useState([])

  async function handle(fileList) {
    const files = [...fileList]
    if (!files.length) return
    setBusy(true)
    const out = []
    for (const f of files) {
      try {
        const { results } = await uploadFile(f, overwrite)
        out.push(...results)
      } catch (e) {
        out.push({ name: f.name, status: 'error', error: e.message })
      }
    }
    setRows(out)
    setBusy(false)
    onChanged?.()
    notifyFilesChanged()
  }

  return (
    <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card
        title="Upload packages"
        description="Add SSIS files from your computer."
        bodyClassName="flex flex-col p-5"
        footer={
          <Check
            label="Replace files that already exist"
            hint="Off by default, so an upload can never overwrite a package by accident."
            checked={overwrite}
            onChange={setOverwrite}
          />
        }
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
          className={`flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 text-center transition ${
            over ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/20'
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UploadCloud className="h-7 w-7" />
          </span>
          <div>
            <div className="text-base font-medium">Drop files here</div>
            <div className="text-sm text-muted-foreground">or choose them from your computer</div>
          </div>
          <Button disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Uploading…' : 'Choose files'}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".dtsx,.conmgr,.ispac"
            className="hidden"
            onChange={(e) => { handle(e.target.files); e.target.value = '' }}
          />
        </div>
      </Card>

      <div className="flex min-h-0 flex-col gap-6">
        <Card title="Accepted files">
          <ul className="space-y-3">
            {FORMATS.map((f) => (
              <li key={f.name} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <f.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 text-sm">
                  <code className="font-medium">{f.name}</code>
                  <div className="text-xs text-muted-foreground">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Results" description={rows.length ? `${rows.length} file${rows.length === 1 ? '' : 's'} processed` : 'Nothing uploaded yet.'} className="flex-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">What happened to each file shows up here.</p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.text ?? r.status}</Badge>
                  <span className="font-medium">{r.name}</span>
                  {r.status === 'exists' && <span className="text-xs text-muted-foreground">Tick “Replace” and upload again to overwrite.</span>}
                  {r.error && <span className="text-xs text-error">{r.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
