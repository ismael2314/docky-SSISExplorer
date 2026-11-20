import { Route } from 'lucide-react'
import { PageHeader } from '@/components/page'

export default function TracePage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Route} title="Trace" subtitle="Follow a table or package through the whole load" />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Route className="h-7 w-7" /></span>
          <h2 className="mt-4 text-base font-semibold">Coming next</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pick a table or package and see everything upstream and downstream of it. This needs table names read out of the SQL, which is the next piece of work.
          </p>
        </div>
      </div>
    </div>
  )
}
