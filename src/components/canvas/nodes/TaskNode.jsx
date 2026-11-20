import { Handle, Position } from '@xyflow/react'
import { KindChip } from '@/components/icons'

export function TaskNode({ data }) {
  return (
    <div className={`task-card w-[236px] rounded-xl border bg-card px-3 py-2.5 text-card-foreground shadow-sm ${data.disabled ? 'opacity-50' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2.5" title={data.label}>
        <KindChip kind={data.kind} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{data.label}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{data.subtitle}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
