import { Handle, NodeResizer, Position } from '@xyflow/react'
import { SquareDashed } from 'lucide-react'

export function ContainerNode({ data, selected }) {
  return (
    <div
      className={`container-card h-full w-full rounded-2xl border-2 border-dashed border-muted-foreground/40 bg-muted/30 ${
        data.disabled ? 'opacity-50' : ''
      }`}
    >
      {/* Select a container to get resize handles on its edges and corners */}
      <NodeResizer isVisible={selected} minWidth={260} minHeight={120} />
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2 px-3 pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <SquareDashed className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
