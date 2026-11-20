// Reads SSIS files into plain JSON models. No SQL Server / SSIS install needed.
//   parseDtsx(xml, fileName)    one package (.dtsx)
//   parseConmgr(xml, fileName)  one project connection manager (.conmgr)
// The JSON shapes are the API contract the future .NET version must produce as well.
import { XMLParser } from 'fast-xml-parser'

// Tags we always want as arrays, even when the file has just one of them.
const LIST_TAGS = new Set([
  'Executable', 'PrecedenceConstraint', 'Variable', 'ConnectionManager',
  'component', 'path', 'property', 'connection',
  'output', 'input', 'outputColumn', 'inputColumn', 'externalMetadataColumn',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,     // DTS:ObjectName -> ObjectName, SQLTask:Connection -> Connection
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => LIST_TAGS.has(name),
})

// ---------- small helpers ----------
const list = (x) => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x])
const attr = (el, name) => (el && typeof el === 'object' ? el['@_' + name] : undefined)
const text = (el) => (el == null ? undefined : typeof el === 'object' ? el['#text'] : el)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Numeric character references (&#10; etc.) in attribute values
const decode = (s) =>
  typeof s !== 'string'
    ? s
    : s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))

const guid = (s) => (s ? s.replace(/:external$/i, '').toUpperCase() : undefined)

const DATA_TYPES = {
  2: 'Int16', 3: 'Int32', 4: 'Single', 5: 'Double', 6: 'Currency', 7: 'DateTime',
  8: 'String', 11: 'Boolean', 13: 'Object', 14: 'Decimal', 16: 'SByte', 17: 'Byte',
  18: 'Char', 19: 'UInt32', 20: 'Int64', 21: 'UInt64',
}

// ---------- column data types ----------
const PIPE_TYPES = {
  i1: 'DT_I1', i2: 'DT_I2', i4: 'DT_I4', i8: 'DT_I8',
  ui1: 'DT_UI1', ui2: 'DT_UI2', ui4: 'DT_UI4', ui8: 'DT_UI8',
  r4: 'DT_R4', r8: 'DT_R8', cy: 'DT_CY', bool: 'DT_BOOL',
  date: 'DT_DATE', dbDate: 'DT_DBDATE', dbTime: 'DT_DBTIME', dbTime2: 'DT_DBTIME2',
  dbTimeStamp: 'DT_DBTIMESTAMP', dbTimeStamp2: 'DT_DBTIMESTAMP2', dbTimeStampoffset: 'DT_DBTIMESTAMPOFFSET',
  filetime: 'DT_FILETIME', guid: 'DT_GUID', image: 'DT_IMAGE', text: 'DT_TEXT', ntext: 'DT_NTEXT',
  decimal: 'DT_DECIMAL', numeric: 'DT_NUMERIC', str: 'DT_STR', wstr: 'DT_WSTR', bytes: 'DT_BYTES',
}

// Closest SQL Server type, shown as a hint next to the SSIS type.
const SQL_TYPES = {
  i1: 'smallint', i2: 'smallint', i4: 'int', i8: 'bigint', ui1: 'tinyint', ui2: 'int', ui4: 'bigint', ui8: 'numeric(20,0)',
  r4: 'real', r8: 'float', cy: 'money', bool: 'bit', date: 'datetime', dbDate: 'date', dbTime: 'time',
  dbTime2: 'time', dbTimeStamp: 'datetime', dbTimeStamp2: 'datetime2', dbTimeStampoffset: 'datetimeoffset',
  filetime: 'datetime', guid: 'uniqueidentifier', image: 'image', text: 'text', ntext: 'ntext',
}

// el: an element with dataType/length/precision/scale attributes; prefix is 'cached' for inputColumn.
function describeType(el, prefix = '') {
  const get = (n) => attr(el, prefix ? prefix + n[0].toUpperCase() + n.slice(1) : n)
  const dt = get('dataType')
  if (!dt) return {}
  const length = get('length')
  const precision = get('precision')
  const scale = get('scale')
  const base = PIPE_TYPES[dt] ?? dt
  let type = base
  let sqlType = SQL_TYPES[dt]
  switch (dt) {
    case 'str': type = length ? `${base}(${length})` : base; sqlType = `varchar(${length ?? 'max'})`; break
    case 'wstr': type = length ? `${base}(${length})` : base; sqlType = `nvarchar(${length ?? 'max'})`; break
    case 'bytes': type = length ? `${base}(${length})` : base; sqlType = `varbinary(${length ?? 'max'})`; break
    case 'numeric': type = `${base}(${precision ?? '?'},${scale ?? 0})`; sqlType = `numeric(${precision ?? 18},${scale ?? 0})`; break
    case 'decimal': type = `${base}(${scale ?? 0})`; sqlType = `decimal(28,${scale ?? 0})`; break
    case 'dbTime2': case 'dbTimeStamp2': case 'dbTimeStampoffset':
      if (scale) type = `${base}(${scale})`
      break
    default:
  }
  return { type, sqlType }
}

// ---------- executable classification ----------
function kindOf(type = '') {
  const t = type.toLowerCase()
  if (t.startsWith('stock:')) return 'container'
  if (t.includes('pipeline')) return 'dataflow'
  if (t.includes('executesqltask')) return 'sql'
  if (t.includes('executepackagetask')) return 'package'
  if (t.includes('sendmailtask')) return 'mail'
  if (t.includes('scripttask')) return 'script'
  return 'task'
}

const TYPE_LABELS = {
  'STOCK:SEQUENCE': 'Sequence Container',
  'STOCK:FORLOOP': 'For Loop Container',
  'STOCK:FOREACHLOOP': 'Foreach Loop Container',
  'Microsoft.Pipeline': 'Data Flow Task',
  'Microsoft.ExecuteSQLTask': 'Execute SQL Task',
  'Microsoft.ExecutePackageTask': 'Execute Package Task',
  'Microsoft.SendMailTask': 'Send Mail Task',
  'Microsoft.ScriptTask': 'Script Task',
  'Microsoft.OLEDBSource': 'OLE DB Source',
  'Microsoft.OLEDBDestination': 'OLE DB Destination',
}
const labelOf = (type = '') =>
  TYPE_LABELS[type] ?? type.replace(/^Microsoft\./, '').replace(/([a-z])([A-Z])/g, '$1 $2')

function componentKind(cls = '') {
  if (/source/i.test(cls)) return 'source'
  if (/destination/i.test(cls)) return 'destination'
  return 'transform'
}

// ---------- tiny SQL summary (first statement only) ----------
function summarizeSql(sql = '') {
  const s = sql.trim()
  let m = /^exec(?:ute)?\s+([^\s(;]+)/i.exec(s)
  if (m) return { operation: 'EXEC', target: m[1] }
  m = /^truncate\s+table\s+([^\s;]+)/i.exec(s)
  if (m) return { operation: 'TRUNCATE', target: m[1] }
  m = /^insert\s+into\s+([^\s(;]+)/i.exec(s)
  if (m) return { operation: 'INSERT', target: m[1] }
  m = /^delete\s+from\s+([^\s;]+)/i.exec(s)
  if (m) return { operation: 'DELETE', target: m[1] }
  m = /^update\s+([^\s;]+)/i.exec(s)
  if (m) return { operation: 'UPDATE', target: m[1] }
  m = /^merge\s+(?:into\s+)?([^\s(;]+)/i.exec(s)
  if (m) return { operation: 'MERGE', target: m[1] }
  return {}
}

// ---------- data flow (pipeline) ----------
const SOURCE_MODES = ['Table or view', 'Table or view (variable)', 'SQL command', 'SQL command (variable)']
const DEST_MODES = [
  'Table or view', 'Table or view (variable)', 'SQL command',
  'Table or view - fast load', 'Table or view - fast load (variable)',
]

function describeComponent(cls, props, conns) {
  const d = {}
  const mode = Number(props.AccessMode)
  if (cls === 'Microsoft.OLEDBSource') {
    d.mode = SOURCE_MODES[mode]
    // Only the property that matches AccessMode is active; the others are stale leftovers.
    if (mode === 0) d.table = props.OpenRowset
    if (mode === 1) d.tableVariable = props.OpenRowsetVariable
    if (mode === 2) d.sqlCommand = decode(props.SqlCommand)
    if (mode === 3) d.sqlVariable = props.SqlCommandVariable
  } else if (cls === 'Microsoft.OLEDBDestination') {
    d.mode = DEST_MODES[mode]
    if (mode === 0 || mode === 3) d.table = props.OpenRowset
    if (mode === 1 || mode === 4) d.tableVariable = props.OpenRowsetVariable
    if (mode === 2) d.sqlCommand = decode(props.SqlCommand)
  }
  if (conns[0]) {
    d.connectionId = conns[0].id
    d.connection = conns[0].refName
  }
  return d
}

const stripPort = (s = '') => s.replace(/\.(?:Outputs|Inputs)\[.*\]$/, '')

const propsOf = (el) =>
  Object.fromEntries(list(el?.properties?.property).map((p) => [attr(p, 'name'), text(p)]))

// Column metadata for every component, linked across components by lineage id.
function parseColumns(comps) {
  const external = new Map() // refId -> { column, type, sqlType }
  const lineage = new Map()  // lineageId -> { component, column, type, sqlType }

  for (const c of comps) {
    const compName = attr(c, 'name')
    for (const side of ['outputs', 'inputs']) {
      for (const io of list(c[side]?.[side === 'outputs' ? 'output' : 'input'])) {
        for (const ext of list(io.externalMetadataColumns?.externalMetadataColumn))
          external.set(attr(ext, 'refId'), { column: attr(ext, 'name'), ...describeType(ext) })
      }
    }
    for (const o of list(c.outputs?.output)) {
      if (attr(o, 'isErrorOut') === 'true') continue
      for (const col of list(o.outputColumns?.outputColumn))
        lineage.set(attr(col, 'lineageId') ?? attr(col, 'refId'), {
          component: compName, column: attr(col, 'name'), ...describeType(col),
        })
    }
  }

  const result = new Map()
  for (const c of comps) {
    const outputs = []
    for (const o of list(c.outputs?.output)) {
      if (attr(o, 'isErrorOut') === 'true') continue
      for (const col of list(o.outputColumns?.outputColumn)) {
        const props = propsOf(col)
        const expression = decode(props.FriendlyExpression ?? props.Expression)
        const src = external.get(attr(col, 'externalMetadataColumnId'))
        outputs.push({
          name: attr(col, 'name'),
          ...describeType(col),
          ...(src && src.column !== attr(col, 'name') ? { sourceColumn: src.column } : {}),
          ...(expression ? { expression } : {}),
        })
      }
    }

    const inputs = []
    for (const i of list(c.inputs?.input)) {
      if (attr(i, 'isErrorOut') === 'true') continue
      for (const col of list(i.inputColumns?.inputColumn)) {
        const from = lineage.get(attr(col, 'lineageId'))
        const to = external.get(attr(col, 'externalMetadataColumnId'))
        const own = describeType(col, 'cached')
        inputs.push({
          name: attr(col, 'cachedName'),
          ...own,
          from: from ? { component: from.component, column: from.column, type: from.type, sqlType: from.sqlType } : null,
          target: to ? { column: to.column, type: to.type, sqlType: to.sqlType } : null,
          // Flag when the type arriving from upstream differs from the destination column's type.
          mismatch: !!(from && to && from.type && to.type && from.type !== to.type),
        })
      }
    }
    result.set(attr(c, 'refId'), { inputs, outputs })
  }
  return result
}

function parsePipeline(exe, ctx) {
  const pipe = exe.ObjectData?.pipeline
  const comps = list(pipe?.components?.component)
  const columns = parseColumns(comps)
  const nodes = []
  for (const c of comps) {
    const cls = attr(c, 'componentClassID')
    const props = propsOf(c)
    const conns = list(c.connections?.connection).map((cn) => {
      const id = guid(attr(cn, 'connectionManagerID'))
      const ref = attr(cn, 'connectionManagerRefId') ?? ''
      const refName = /\[(.+)\]$/.exec(ref)?.[1]
      if (id && refName && !ctx.connections.has(id))
        ctx.connections.set(id, { id, name: refName, scope: 'project' })
      return { id, refName }
    })
    const id = attr(c, 'refId')
    nodes.push({
      id,
      name: attr(c, 'name'),
      type: cls,
      typeLabel: labelOf(cls),
      kind: componentKind(cls),
      parent: null,
      description: attr(c, 'description'),
      disabled: false,
      details: describeComponent(cls, props, conns),
      columns: columns.get(id),
    })
    // Variables can be referenced from inside a component (SqlCommandVariable, expressions).
    ctx.targets.push({ id, name: attr(c, 'name'), kind: 'component', taskId: attr(exe, 'refId'), text: JSON.stringify(c) })
  }
  const edges = list(pipe?.paths?.path).map((p) => {
    const start = attr(p, 'startId') ?? ''
    return {
      id: attr(p, 'refId') ?? `${start}->${attr(p, 'endId')}`,
      from: stripPort(start),
      to: stripPort(attr(p, 'endId')),
      kind: /error output/i.test(start) ? 'Failure' : 'Success',
    }
  })
  return { nodes, edges }
}

// ---------- control flow ----------
function collectVariables(el, scope, ctx) {
  for (const v of list(el.Variables?.Variable)) {
    const vv = v.VariableValue
    const isExpr = attr(v, 'EvaluateAsExpression') === 'True'
    ctx.variables.push({
      scope,
      namespace: attr(v, 'Namespace'),
      name: attr(v, 'ObjectName'),
      dataType: DATA_TYPES[attr(vv, 'DataType')] ?? attr(vv, 'DataType'),
      value: decode(text(vv)) ?? '',
      expression: isExpr ? decode(attr(v, 'Expression')) : undefined,
    })
  }
}

function describeExecutable(e, kind) {
  const od = e.ObjectData
  if (kind === 'sql') {
    const d = od?.SqlTaskData
    const sql = decode(attr(d, 'SqlStatementSource')) ?? ''
    const sourceType = attr(d, 'SqlStmtSourceType') ?? 'DirectInput'
    return {
      sqlSourceType: sourceType,
      ...(sourceType === 'Variable' ? { sqlVariable: sql } : { sql, ...summarizeSql(sql) }),
      connectionId: guid(attr(d, 'Connection')),
    }
  }
  if (kind === 'package') {
    const t = od?.ExecutePackageTask
    const child = text(t?.PackageName)
    return {
      childPackage: child,
      childPackageId: child?.replace(/\.dtsx$/i, ''),
      useProjectReference: text(t?.UseProjectReference) === 'True',
    }
  }
  return {}
}

// What an executable owns itself: everything except its child tasks and variable definitions.
// (The data flow's components are scanned separately, one by one.)
function ownText(e, kind) {
  const { Executables, Variables, ...rest } = e
  if (kind === 'dataflow') delete rest.ObjectData
  return JSON.stringify(rest)
}

function walk(container, parentId, ctx) {
  for (const e of list(container.Executables?.Executable)) {
    const id = attr(e, 'refId')
    const type = attr(e, 'ExecutableType') ?? attr(e, 'CreationName')
    const kind = kindOf(type)
    const name = attr(e, 'ObjectName')
    ctx.nodes.push({
      id,
      name,
      type,
      typeLabel: labelOf(type),
      kind,
      parent: parentId,
      description: attr(e, 'Description'),
      disabled: attr(e, 'Disabled') === 'True',
      details: describeExecutable(e, kind),
    })
    ctx.targets.push({ id, name, kind, text: ownText(e, kind) })
    collectVariables(e, id, ctx)
    if (kind === 'dataflow') ctx.dataFlows[id] = parsePipeline(e, ctx)
    walk(e, id, ctx)
  }
  for (const pc of list(container.PrecedenceConstraints?.PrecedenceConstraint)) {
    const value = attr(pc, 'Value') // absent = Success
    const from = attr(pc, 'From')
    const to = attr(pc, 'To')
    ctx.edges.push({
      id: attr(pc, 'refId') ?? `${from}->${to}`,
      from,
      to,
      kind: value === '1' ? 'Failure' : value === '2' ? 'Completion' : 'Success',
      expression: decode(attr(pc, 'Expression')),
      logicalAnd: attr(pc, 'LogicalAnd') !== 'False',
    })
  }
}

// ---------- variable usage ----------
// A variable is "used" when a task, constraint or data flow component refers to it, or when
// another *used* variable's expression does. References inside unused variables don't count.
const varKey = (v) => `${v.namespace}::${v.name}`

function referenceRegex(v) {
  const ns = esc(v.namespace ?? 'User')
  const nm = esc(v.name)
  const forms = [`(?<![\\w$])${ns}::${nm}(?![\\w])`]
  // Expressions may leave the namespace out for user variables: @[Name] or @Name
  if (v.namespace === 'User') forms.push(`@\\[${nm}\\]`, `@${nm}(?![\\w])`)
  return new RegExp(forms.join('|'), 'i')
}

function computeUsage(ctx) {
  const vars = ctx.variables
  const regex = new Map(vars.map((v) => [varKey(v), referenceRegex(v)]))
  const usedBy = new Map(vars.map((v) => [varKey(v), []]))
  const add = (key, entry) => {
    const arr = usedBy.get(key)
    if (!arr.some((e) => e.id === entry.id)) arr.push(entry)
  }

  const nameOf = new Map(ctx.nodes.map((n) => [n.id, n.name]))
  for (const t of ctx.targets) {
    for (const v of vars) {
      if (!regex.get(varKey(v)).test(t.text)) continue
      add(varKey(v), { id: t.id, name: t.name, kind: t.kind })
      // Also credit the data flow task that owns the component, so the control-flow view shows it.
      if (t.taskId) add(varKey(v), { id: t.taskId, name: nameOf.get(t.taskId), kind: 'dataflow', indirect: true })
    }
  }

  // Expressions of variables that are themselves used pull in the variables they mention.
  const expanded = new Set()
  for (let changed = true; changed; ) {
    changed = false
    for (const v of vars) {
      const k = varKey(v)
      if (!v.expression || expanded.has(k) || usedBy.get(k).length === 0) continue
      expanded.add(k)
      changed = true
      for (const w of vars)
        if (w !== v && regex.get(varKey(w)).test(v.expression))
          add(varKey(w), { id: `var:${k}`, name: k, kind: 'variable' })
    }
  }

  for (const v of vars) {
    v.usedBy = usedBy.get(varKey(v))
    v.used = v.usedBy.length > 0
  }
}

// Fill in things that need the whole file: connection names, variable-based SQL.
function resolve(ctx) {
  const vars = new Map(ctx.variables.map((v) => [`${v.namespace}::${v.name}`.toLowerCase(), v]))
  const lookup = (ref) => vars.get(String(ref ?? '').toLowerCase())

  const fix = (n) => {
    const d = n.details
    if (d.connectionId && !d.connection) d.connection = ctx.connections.get(d.connectionId)?.name
    if (d.sqlVariable) {
      const v = lookup(d.sqlVariable)
      if (v) {
        d.resolvedSql = v.value
        if (v.expression) d.sqlExpression = v.expression
        if (n.kind === 'sql') Object.assign(d, summarizeSql(v.value))
      }
    }
  }
  ctx.nodes.forEach(fix)
  Object.values(ctx.dataFlows).forEach((df) => df.nodes.forEach(fix))
}

export function parseDtsx(xml, fileName) {
  const doc = parser.parse(xml.replace(/^\uFEFF/, ''))
  const root = list(doc.Executable)[0]
  if (!root) throw new Error('Not an SSIS package: no root DTS:Executable element')

  const ctx = { nodes: [], edges: [], variables: [], dataFlows: {}, connections: new Map(), targets: [] }

  for (const cm of list(root.ConnectionManagers?.ConnectionManager)) {
    const id = guid(attr(cm, 'DTSID'))
    ctx.connections.set(id, { id, name: attr(cm, 'ObjectName'), type: attr(cm, 'CreationName'), scope: 'package' })
  }
  collectVariables(root, 'Package', ctx)
  ctx.targets.push({ id: attr(root, 'refId') ?? 'Package', name: attr(root, 'ObjectName'), kind: 'package', text: ownText(root, 'package') })
  walk(root, null, ctx)
  resolve(ctx)
  computeUsage(ctx)

  const count = (k) => ctx.nodes.filter((n) => n.kind === k).length
  return {
    id: fileName.replace(/\.dtsx$/i, ''),
    fileName,
    name: attr(root, 'ObjectName'),
    description: attr(root, 'Description'),
    createdAt: attr(root, 'CreationDate'),
    versionBuild: attr(root, 'VersionBuild'),
    variables: ctx.variables,
    connections: [...ctx.connections.values()],
    nodes: ctx.nodes,
    edges: ctx.edges,
    dataFlows: ctx.dataFlows,
    stats: {
      tasks: ctx.nodes.length - count('container'),
      containers: count('container'),
      dataFlows: count('dataflow'),
      sqlTasks: count('sql'),
      childPackages: count('package'),
      variablesUsed: ctx.variables.filter((v) => v.used).length,
    },
  }
}

// ---------- project connection managers (.conmgr) ----------
const maskSecrets = (cs = '') => cs.replace(/((?:password|pwd)\s*=\s*)[^;]*/gi, '$1********')

function connectionStringParts(cs = '') {
  const kv = {}
  for (const part of cs.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) kv[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  return {
    server: kv['data source'] ?? kv.server ?? kv['server name'],
    database: kv['initial catalog'] ?? kv.database,
    provider: kv.provider,
  }
}

export function parseConmgr(xml, fileName) {
  const doc = parser.parse(xml.replace(/^\uFEFF/, ''))
  const cm = list(doc.ConnectionManager)[0]
  if (!cm) throw new Error('Not an SSIS connection manager: no root DTS:ConnectionManager element')
  const inner = list(cm.ObjectData?.ConnectionManager)[0]
  const connectionString = maskSecrets(attr(inner, 'ConnectionString') ?? '')
  return {
    id: guid(attr(cm, 'DTSID')),
    name: attr(cm, 'ObjectName'),
    type: attr(cm, 'CreationName'),
    fileName,
    connectionString,
    ...connectionStringParts(connectionString),
  }
}
