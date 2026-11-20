// Right-hand panel. Shows the selected task/component, or the package summary when nothing is selected.
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const FIELDS = [
  ['connection', 'Connection'],
  ['childPackage', 'Child package'],
  ['mode', 'Access mode'],
  ['table', 'Table'],
  ['tableVariable', 'Table variable'],
  ['sqlVariable', 'SQL variable'],
  ['sql', 'SQL', 'code'],
  ['sqlCommand', 'SQL command', 'code'],
  ['resolvedSql', 'Query (variable value)', 'code'],
  ['sqlExpression', 'Variable expression', 'code'],
]

function Row({ label, children }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  )
}

const Code = ({ children }) => (
  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-words">{children}</pre>
)

// SQL type first (what people recognise), SSIS type underneath.
function Type({ type, sqlType }) {
  if (!type) return <span className="text-xs text-muted-foreground">?</span>
  return (
    <span className="block leading-tight">
      <span className="font-mono text-xs">{sqlType ?? type}</span>
      {sqlType && <span className="block font-mono text-[10px] text-muted-foreground">{type}</span>}
    </span>
  )
}

function Variables({ variables }) {
  if (!variables?.length) return null
  return (
    <Row label={`Variables used (${variables.length})`}>
      <ul className="space-y-2">
        {variables.map((v) => (
          <li key={`${v.namespace}::${v.name}`}>
            <div>
              {v.namespace}::{v.name} <span className="text-xs text-muted-foreground">{v.dataType}</span>
            </div>
            {v.expression ? (
              <Code>{v.expression}</Code>
            ) : (
              v.value && <div className="truncate text-xs text-muted-foreground">{v.value}</div>
            )}
          </li>
        ))}
      </ul>
    </Row>
  )
}

// Where each column comes from and where it goes, with data types.
function Columns({ columns }) {
  const inputs = columns?.inputs ?? []
  const outputs = columns?.outputs ?? []
  const mapped = inputs.filter((i) => i.target)
  const plainInputs = inputs.filter((i) => !i.target)
  const upstream = [...new Set(mapped.map((i) => i.from?.component).filter(Boolean))].join(', ')
  const mismatches = mapped.filter((i) => i.mismatch).length

  return (
    <>
      {mapped.length > 0 && (
        <Row label={`Column mapping (${mapped.length})`}>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="truncate">From {upstream}</span>
            <span />
            <span>To this destination</span>
          </div>
          <ul className="mt-1 divide-y rounded-lg border">
            {mapped.map((i) => (
              <li
                key={i.name}
                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-2 py-1.5 ${
                  i.mismatch ? 'bg-warning/10' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm" title={i.from?.column ?? i.name}>{i.from?.column ?? i.name}</div>
                  <Type type={i.from?.type ?? i.type} sqlType={i.from?.sqlType ?? i.sqlType} />
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="min-w-0">
                  <div className="truncate text-sm" title={i.target.column}>{i.target.column}</div>
                  <Type type={i.target.type} sqlType={i.target.sqlType} />
                </div>
              </li>
            ))}
          </ul>
          {mismatches > 0 && (
            <p className="mt-1 text-xs text-warn">
              {mismatches} highlighted: the type arriving differs from the destination column.
            </p>
          )}
        </Row>
      )}

      {plainInputs.length > 0 && (
        <Row label={`Input columns (${plainInputs.length})`}>
          <ul className="divide-y rounded-lg border">
            {plainInputs.map((i) => (
              <li key={i.name} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="min-w-0 truncate text-sm">{i.name}</span>
                <Type type={i.type} sqlType={i.sqlType} />
              </li>
            ))}
          </ul>
        </Row>
      )}

      {outputs.length > 0 && (
        <Row label={`Output columns (${outputs.length})`}>
          <ul className="divide-y rounded-lg border">
            {outputs.map((o) => (
              <li key={o.name} className="px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">
                    {o.name}
                    {o.sourceColumn && <span className="ml-1 text-xs text-muted-foreground">← {o.sourceColumn}</span>}
                  </span>
                  <Type type={o.type} sqlType={o.sqlType} />
                </div>
                {o.expression && <Code>{o.expression}</Code>}
              </li>
            ))}
          </ul>
        </Row>
      )}
    </>
  )
}

export function NodeDetails({ node, onOpen, variables }) {
  const d = node.details ?? {}
  const canOpen = onOpen && (node.kind === 'dataflow' || (node.kind === 'package' && d.childResolved))
  return (
    <>
      <h2 className="text-lg font-semibold">{node.name}</h2>
      <p className="text-sm text-muted-foreground">
        {node.typeLabel}
        {node.disabled && ' · disabled'}
      </p>
      {canOpen && (
        <Button className="mt-3" onClick={onOpen}>
          {node.kind === 'dataflow' ? 'Open data flow →' : 'Open package →'}
        </Button>
      )}
      {node.description && node.description !== node.typeLabel && (
        <p className="mt-2 text-sm">{node.description}</p>
      )}

      {FIELDS.map(([key, label, style]) => {
        let value = d[key]
        if (key === 'connection' && !value && d.connectionId) value = `${d.connectionId} (name not known yet)`
        if (!value) return null
        return (
          <Row key={key} label={label}>
            {style === 'code' ? <Code>{value}</Code> : value}
          </Row>
        )
      })}

      {node.kind === 'package' && (
        <Row label="Resolved">
          {d.childResolved ? 'Yes, found in the packages folder' : (
            <>No. <Link className="text-primary underline" to="/settings?tab=upload">Upload that .dtsx</Link> to follow the flow into it.</>
          )}
        </Row>
      )}

      <Columns columns={node.columns} />
      <Variables variables={variables} />

      <p className="mt-6 break-all text-xs text-muted-foreground">{node.id}</p>
    </>
  )
}

export function PackageSummary({ summary }) {
  if (!summary) return null
  const s = summary.stats
  // Variables that nothing refers to are left out on purpose.
  const used = summary.variables.filter((v) => v.used)
  return (
    <>
      <h2 className="text-lg font-semibold">{summary.name}</h2>
      <p className="text-sm text-muted-foreground">{summary.fileName}</p>
      <p className="mt-2 text-sm">
        {s.tasks} tasks · {s.containers} containers · {s.dataFlows} data flows · {s.childPackages} child packages
      </p>

      <Row label={`Connections (${summary.connections.length})`}>
        {summary.connections.length ? (
          <ul className="space-y-2">
            {summary.connections.map((c) => (
              <li key={c.id}>
                {c.resolved ? (
                  <>
                    <span className="font-medium">{c.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      {[c.type, c.server, c.database].filter(Boolean).join(' · ')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="break-all font-mono text-xs">{c.id}</span>
                    <div className="text-xs text-muted-foreground">
                      Name unknown. <Link className="text-primary underline" to="/settings?tab=upload">Upload the project&apos;s .conmgr files</Link>.
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : 'None'}
      </Row>

      <Row label={`Variables used (${used.length})`}>
        {used.length === 0 ? (
          <span className="text-muted-foreground">No variables are used in this package.</span>
        ) : (
          <ul className="space-y-3">
            {used.map((v) => (
              <li key={`${v.scope}${v.namespace}${v.name}`}>
                <div>
                  {v.namespace}::{v.name} <span className="text-xs text-muted-foreground">{v.dataType}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Used by {v.usedBy.filter((u) => !u.indirect).map((u) => (u.kind === 'variable' ? `${u.name} (expression)` : u.name)).join(', ')}
                </div>
                {v.expression ? (
                  <Code>{v.expression}</Code>
                ) : (
                  v.value && <div className="truncate text-xs text-muted-foreground">{v.value}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Row>
    </>
  )
}
