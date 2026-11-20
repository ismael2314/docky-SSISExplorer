import {
  ArrowDownToLine, ArrowUpFromLine, Cog, Database, FileCode2, Mail, Package, Shuffle, SquareDashed, Wand2, Workflow,
} from 'lucide-react'

// One icon and one colour per kind of task. The colour comes from the palette (see lib/palette.js).
export const KINDS = {
  package: { icon: Package, label: 'Execute package', cls: 'kind-package' },
  dataflow: { icon: Workflow, label: 'Data flow', cls: 'kind-dataflow' },
  sql: { icon: Database, label: 'Execute SQL', cls: 'kind-sql' },
  container: { icon: SquareDashed, label: 'Container', cls: 'kind-container' },
  source: { icon: ArrowDownToLine, label: 'Source', cls: 'kind-source' },
  destination: { icon: ArrowUpFromLine, label: 'Destination', cls: 'kind-destination' },
  transform: { icon: Shuffle, label: 'Transform', cls: 'kind-transform' },
  mail: { icon: Mail, label: 'Send mail', cls: 'kind-mail' },
  script: { icon: FileCode2, label: 'Script', cls: 'kind-script' },
  task: { icon: Cog, label: 'Task', cls: 'kind-other' },
}
export const kindOf = (kind) => KINDS[kind] ?? KINDS.task

// Coloured rounded square with the kind's icon. size: 'sm' | 'md' | 'lg'
export function KindChip({ kind, size = 'md', className = '' }) {
  const k = kindOf(kind)
  const Icon = k.icon
  const dims = { sm: 'h-6 w-6 rounded-md', md: 'h-9 w-9 rounded-lg', lg: 'h-11 w-11 rounded-xl' }[size]
  const icon = { sm: 'h-3.5 w-3.5', md: 'h-[18px] w-[18px]', lg: 'h-5 w-5' }[size]
  return (
    <span className={`kind-chip flex shrink-0 items-center justify-center ${k.cls} ${dims} ${className}`}>
      <Icon className={icon} strokeWidth={2} />
    </span>
  )
}

export function KindIcon({ kind, className = 'h-4 w-4' }) {
  const k = kindOf(kind)
  const Icon = k.icon
  return <Icon className={`${k.cls} kind-text ${className}`} strokeWidth={2} />
}
