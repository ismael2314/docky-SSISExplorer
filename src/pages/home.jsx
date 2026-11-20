import { useEffect, useState } from 'react'
import { Dashboard } from '@/components/dashboard/dashboard'
import { getDashboard } from '@/lib/api'

export default function HomePage() {
  const [state, setState] = useState({ data: null, error: null })

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getDashboard()
        .then((data) => !cancelled && setState({ data, error: null }))
        .catch((e) => !cancelled && setState({ data: null, error: e.message }))
    load()
    window.addEventListener('docky:files-changed', load)
    return () => { cancelled = true; window.removeEventListener('docky:files-changed', load) }
  }, [])

  return (
    <div className="h-full">
      {state.error ? (
        <p className="p-6 text-destructive">Could not reach the API: {state.error}. Is it running on port 5000?</p>
      ) : state.data ? (
        <Dashboard data={state.data} />
      ) : (
        <p className="p-6 text-muted-foreground">Loading…</p>
      )}
    </div>
  )
}
