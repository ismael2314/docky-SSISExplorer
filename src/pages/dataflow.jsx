import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { FlowCanvas } from '@/components/canvas/flow'
import { Breadcrumb } from '@/components/breadcrumb'
import { NodeDetails } from '@/components/details-panel'
import { getDataFlow, getPackage } from '@/lib/api'

export default function DataFlowPage() {
  const { packageId, taskId } = useParams()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const trail = location.state?.trail ?? []
  const [state, setState] = useState({ graph: null, summary: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ graph: null, summary: null, error: null })
    Promise.all([getDataFlow(packageId, taskId), getPackage(packageId)])
      .then(([graph, summary]) => !cancelled && setState({ graph, summary, error: null }))
      .catch((error) => !cancelled && setState({ graph: null, summary: null, error: error.message }))
    return () => { cancelled = true }
  }, [packageId, taskId])

  const { graph, summary, error } = state
  const selected = graph?.nodes.find((n) => n.id === params.get('node'))
  const usedHere = selected && summary?.variables.filter((v) => v.usedBy.some((u) => u.id === selected.id))
  const taskName = taskId.split('\\').pop()
  const layoutKey = `dataflow:${packageId}:${taskId}`

  const crumbs = [
    ...trail,
    {
      label: packageId,
      to: `/packages/${encodeURIComponent(packageId)}?node=${encodeURIComponent(taskId)}`,
      trail,
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <Breadcrumb trail={crumbs} current={`${taskName} (data flow)`} />

      {error ? (
        <p className="p-6 text-destructive">{error}</p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {graph ? (
              <FlowCanvas
                key={layoutKey}
                layoutKey={layoutKey}
                graph={graph}
                selectedId={selected?.id}
                onSelect={(id) => setParams(id ? { node: id } : {}, { replace: true, state: location.state })}
              />
            ) : (
              <p className="p-4 text-muted-foreground">Loading…</p>
            )}
          </div>
          <aside className="w-[26rem] shrink-0 overflow-auto border-l p-4">
            {selected ? (
              <NodeDetails node={selected} variables={usedHere} />
            ) : (
              <p className="text-sm text-muted-foreground">Click a source or destination to see its column mapping, data types and variables.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
