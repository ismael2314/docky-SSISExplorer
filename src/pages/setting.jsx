import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Database, Files, Palette, Settings, Upload } from 'lucide-react'
import { PageHeader, Tabs } from '@/components/page'
import { AppearanceTab } from './settings/appearance'
import { UploadTab } from './settings/upload'
import { SqlTab } from './settings/catalog'
import { FilesTab } from './settings/files'

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'sql', label: 'SQL Server', icon: Database },
  { id: 'files', label: 'Files', icon: Files },
]
// Older links such as /settings#catalog (a hash instead of ?tab=) still work.
const FROM_HASH = { appearance: 'appearance', upload: 'upload', catalog: 'sql', sql: 'sql', files: 'files' }

export default function SettingsPage() {
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const [version, setVersion] = useState(0)
  const changed = () => setVersion((v) => v + 1) // makes the Files tab reload

  const wanted = params.get('tab') ?? FROM_HASH[hash.slice(1)]
  const tab = TABS.some((t) => t.id === wanted) ? wanted : 'appearance'

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Settings} title="Settings" subtitle="Appearance, packages and the SQL Server connection" />
      <Tabs tabs={TABS} value={tab} onChange={(id) => navigate({ search: `?tab=${id}`, hash: '' }, { replace: true })} />
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'upload' && <UploadTab onChanged={changed} />}
        {tab === 'sql' && <SqlTab onImported={changed} />}
        {tab === 'files' && <FilesTab refreshKey={version} />}
      </div>
    </div>
  )
}
