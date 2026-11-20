import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageHeader } from '@/components/page'

export default function SearchPage() {
  const [params] = useSearchParams()
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Search} title="Search" subtitle={`Results for “${params.get('q') ?? ''}”`} />
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Search across all packages is not built yet. To search inside one package&apos;s run, open its Hierarchy page and use the search box there.
        </p>
      </div>
    </div>
  )
}
