import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Compass className="h-7 w-7" /></span>
        <h1 className="mt-4 text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">That address does not match anything here.</p>
        <Link to="/" className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Back to the dashboard</Link>
      </div>
    </div>
  )
}
