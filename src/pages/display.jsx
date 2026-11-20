import { useEffect, useState } from 'react'
import { Network } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FlowCanvas } from '@/components/canvas/flow'
import { Breadcrumb } from '@/components/breadcrumb'
import { NodeDetails, PackageSummary } from '@/components/details-panel'
import { getFlow, getPackage } from '@/lib/api'

export const Details = () => {
  const { packageId } = useParams() // already URL-decoded
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const trail = location.state?.trail ?? [] // packages we came from (lost on a hard refresh)
  const [state, setState] = useState({ graph: null, summary: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ graph: null, summary: null, error: null })
    Promise.all([getFlow(packageId), getPackage(packageId)])
      .then(([graph, summary]) => !cancelled && setState({ graph, summary, error: null }))
      .catch((error) => !cancelled && setState({ graph: null, summary: null, error: error.message }))
    return () => { cancelled = true }
  }, [packageId])

  const { graph, summary, error } = state
  const selected = graph?.nodes.find((n) => n.id === params.get('node'))
  const usedHere = selected && summary?.variables.filter((v) => v.usedBy.some((u) => u.id === selected.id))

  // Remember this package (with the task we left from selected) so "Back" returns to the same spot.
  const here = (nodeId) => ({
    label: packageId,
    to: `/packages/${encodeURIComponent(packageId)}?node=${encodeURIComponent(nodeId)}`,
    trail,
  })

  const openNode = (id) => {
    const node = graph?.nodes.find((n) => n.id === id)
    if (!node) return
    if (node.kind === 'dataflow')
      navigate(`/packages/${encodeURIComponent(packageId)}/dataflow/${encodeURIComponent(node.id)}`, {
        state: { trail },
      })
    else if (node.kind === 'package' && node.details.childResolved)
      navigate(`/packages/${encodeURIComponent(node.details.childPackageId)}`, {
        state: { trail: [...trail, here(node.id)] },
      })
  }

  if (error)
    return (
      <div className="flex h-full flex-col">
        <Breadcrumb trail={trail} current={packageId} />
        <p className="p-6 text-destructive">Could not load “{packageId}”: {error}</p>
      </div>
    )

  const layoutKey = `flow:${packageId}`

  return (
    <div className="flex h-full flex-col">
      <Breadcrumb
        trail={trail}
        current={packageId}
        actions={
          <Link to={`/hierarchy/${encodeURIComponent(packageId)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted">
            <Network className="h-4 w-4" />
            Hierarchy
          </Link>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {graph ? (
            <FlowCanvas
              key={layoutKey}
              layoutKey={layoutKey}
              graph={graph}
              selectedId={selected?.id}
              onSelect={(id) => setParams(id ? { node: id } : {}, { replace: true, state: location.state })}
              onOpen={openNode}
            />
          ) : (
            <p className="p-4 text-muted-foreground">Loading…</p>
          )}
        </div>

        <aside className="w-[26rem] shrink-0 overflow-auto border-l p-4">
          {selected ? (
            <NodeDetails node={selected} variables={usedHere} onOpen={() => openNode(selected.id)} />
          ) : (
            <PackageSummary summary={summary} />
          )}
        </aside>
      </div>
    </div>
  )
}
