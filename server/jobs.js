// SQL Server Agent jobs, read from msdb. Everything that turns msdb's numeric codes into
// something readable is a pure function, so it can be tested without a SQL Server.
import { HttpError } from './errors.js'
import { withPool } from './catalog.js'

// ---------- msdb stores dates and times as integers (20261117 and 93000 for 09:30:00) ----------
const pad = (n, w = 2) => String(n).padStart(w, '0')

export function intToTime(t = 0) {
  const s = pad(t, 6)
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
}
export function intToDate(d = 0) {
  if (!d || d < 19000102) return null // 0 and 1900-01-01 mean "not set"
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
// A Date from the driver holds the server's clock time in its UTC fields.
export const naive = (dt) =>
  dt instanceof Date && !Number.isNaN(dt.getTime())
    ? `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`
    : null
const dateTime = (d, t) => {
  const date = intToDate(d)
  return date ? `${date} ${intToTime(t)}` : null
}
const hm = (t) => {
  const s = intToTime(t)
  return s.endsWith(':00') ? s.slice(0, 5) : s
}
const durationSeconds = (d = 0) => Math.floor(d / 10000) * 3600 + (Math.floor(d / 100) % 100) * 60 + (d % 100)

// ---------- schedules in words ----------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] // weekly bit mask: 1 = Sunday ... 64 = Saturday
const REL = { 1: 'first', 2: 'second', 4: 'third', 8: 'fourth', 16: 'last' }
const REL_DAY = { 1: 'Sunday', 2: 'Monday', 3: 'Tuesday', 4: 'Wednesday', 5: 'Thursday', 6: 'Friday', 7: 'Saturday', 8: 'day', 9: 'weekday', 10: 'weekend day' }

export function describeSchedule(s) {
  let when
  switch (s.freq_type) {
    case 1:
      return `Once on ${intToDate(s.active_start_date) ?? 'a set date'} at ${hm(s.active_start_time)}`
    case 4:
      when = s.freq_interval <= 1 ? 'Every day' : `Every ${s.freq_interval} days`
      break
    case 8: {
      const weeks = s.freq_recurrence_factor > 1 ? `Every ${s.freq_recurrence_factor} weeks` : null
      const mask = s.freq_interval
      const days = DAYS.filter((_, i) => mask & (1 << i))
      if (mask === 127) when = weeks ?? 'Every day'
      else if (mask === 62) when = weeks ? `${weeks} on weekdays` : 'Every weekday'
      else if (mask === 65) when = weeks ? `${weeks} on weekends` : 'Every weekend'
      else when = `${weeks ?? 'Every week'} on ${days.join(', ')}`
      break
    }
    case 16:
      when = `Day ${s.freq_interval} of ${s.freq_recurrence_factor > 1 ? `every ${s.freq_recurrence_factor} months` : 'every month'}`
      break
    case 32:
      when = `The ${REL[s.freq_relative_interval] ?? '?'} ${REL_DAY[s.freq_interval] ?? 'day'} of ${s.freq_recurrence_factor > 1 ? `every ${s.freq_recurrence_factor} months` : 'every month'}`
      break
    case 64:
      return 'When SQL Server Agent starts'
    case 128:
      return 'When the computer is idle'
    default:
      return 'Unknown schedule'
  }
  const unit = { 2: 'second', 4: 'minute', 8: 'hour' }[s.freq_subday_type]
  if (!unit) return `${when} at ${hm(s.active_start_time)}`
  const n = s.freq_subday_interval
  return `${when}, ${n <= 1 ? `every ${unit}` : `every ${n} ${unit}s`} from ${hm(s.active_start_time)} to ${hm(s.active_end_time)}`
}

// ---------- which SSIS package a job step runs ----------
// SSIS steps keep the package in the command line, e.g.
//   /ISSERVER "\"\SSISDB\Finance\LoadProject\Master.dtsx\"" /SERVER "\".\""
//   /SQL "\"\Finance\Master\"" /SERVER ...        /FILE "\"D:\etl\Master.dtsx\"" ...
export function parsePackageRef(command = '') {
  const m = /\/(ISSERVER|SQL|FILE)\s+"((?:\\"|[^"])*)"/i.exec(command)
  if (!m) return null
  const via = m[1].toUpperCase()
  const path = m[2].replace(/\\"/g, '"').replace(/^"+|"+$/g, '')
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (!parts.length) return null
  const name = parts[parts.length - 1].replace(/\.dtsx$/i, '')
  if (via === 'ISSERVER' && /^ssisdb$/i.test(parts[0]))
    return { name, folder: parts[1], project: parts[2], via }
  return { name, via, path }
}

// ---------- put the rows together ----------
const OUTCOMES = { 0: 'failed', 1: 'succeeded', 2: 'retry', 3: 'canceled', 5: 'unknown' }

export function buildJobs({ jobs = [], schedules = [], steps = [], servers = [], activity = [], now = null }) {
  const group = (rows) => {
    const m = new Map()
    for (const r of rows) {
      if (!m.has(r.job_id)) m.set(r.job_id, [])
      m.get(r.job_id).push(r)
    }
    return m
  }
  const schedBy = group(schedules)
  const stepBy = group(steps)
  const serverBy = new Map(servers.map((r) => [r.job_id, r]))
  const activityBy = new Map(activity.map((r) => [r.job_id, r]))

  const out = jobs.map((j) => {
    const scheds = (schedBy.get(j.job_id) ?? []).map((s) => ({
      id: s.schedule_id,
      name: s.name,
      enabled: !!s.enabled,
      text: describeSchedule(s),
      nextRun: dateTime(s.next_run_date, s.next_run_time),
      // when in the day it starts, used to order jobs by time of day (not for "when agent starts" / idle)
      timeOfDay: s.freq_type === 64 || s.freq_type === 128 ? null : intToTime(s.active_start_time).slice(0, 5),
    }))
    const live = scheds.filter((s) => s.enabled)
    const act = activityBy.get(j.job_id)

    // Next run: the earliest of its enabled schedules; Agent's own activity record is the fallback.
    let nextRun = null
    if (j.enabled) {
      const candidates = live.map((s) => s.nextRun).filter(Boolean).sort()
      nextRun = candidates[0] ?? naive(act?.next_scheduled_run_date)
    }

    const sv = serverBy.get(j.job_id)
    const lastAt = sv ? dateTime(sv.last_run_date, sv.last_run_time) : null
    const running = !!(act?.start_execution_date && !act?.stop_execution_date)

    const jobSteps = (stepBy.get(j.job_id) ?? [])
      .sort((a, b) => a.step_id - b.step_id)
      .map((st) => ({
        id: st.step_id,
        name: st.step_name,
        subsystem: st.subsystem,
        database: st.database_name,
        command: String(st.command ?? '').slice(0, 1500),
        package: st.subsystem === 'SSIS' ? parsePackageRef(st.command) : null,
      }))

    const times = live.map((s) => s.timeOfDay).filter(Boolean).sort()
    return {
      id: j.job_id,
      name: j.name,
      description: j.description && j.description !== 'No description available.' ? j.description : null,
      enabled: !!j.enabled,
      category: j.category,
      owner: j.owner,
      modified: naive(j.date_modified),
      status: running ? 'running' : !j.enabled ? 'disabled' : nextRun ? 'scheduled' : 'unscheduled',
      nextRun,
      timeOfDay: times[0] ?? null,
      schedules: scheds,
      lastRun: lastAt
        ? { at: lastAt, outcome: OUTCOMES[sv.last_run_outcome] ?? 'unknown', seconds: durationSeconds(sv.last_run_duration), message: sv.last_outcome_message || null }
        : null,
      steps: jobSteps,
    }
  })

  // Soonest first; jobs with no upcoming run go last, by name.
  out.sort((a, b) => (a.nextRun && b.nextRun ? a.nextRun.localeCompare(b.nextRun) : a.nextRun ? -1 : b.nextRun ? 1 : 0) || a.name.localeCompare(b.name))

  return {
    now: naive(now),
    summary: {
      total: out.length,
      enabled: out.filter((j) => j.enabled).length,
      disabled: out.filter((j) => !j.enabled).length,
      running: out.filter((j) => j.status === 'running').length,
      failed: out.filter((j) => j.lastRun?.outcome === 'failed').length,
      withSsis: out.filter((j) => j.steps.some((s) => s.package)).length,
    },
    jobs: out,
  }
}

// ---------- reading msdb ----------
const Q = {
  jobs: `SELECT CONVERT(varchar(36), j.job_id) AS job_id, j.name, j.description, j.enabled, c.name AS category,
                SUSER_SNAME(j.owner_sid) AS owner, j.date_created, j.date_modified
         FROM dbo.sysjobs j LEFT JOIN dbo.syscategories c ON c.category_id = j.category_id`,
  schedules: `SELECT CONVERT(varchar(36), js.job_id) AS job_id, s.schedule_id, s.name, s.enabled, s.freq_type, s.freq_interval,
                     s.freq_subday_type, s.freq_subday_interval, s.freq_relative_interval, s.freq_recurrence_factor,
                     s.active_start_date, s.active_end_date, s.active_start_time, s.active_end_time, js.next_run_date, js.next_run_time
              FROM dbo.sysjobschedules js JOIN dbo.sysschedules s ON s.schedule_id = js.schedule_id`,
  steps: `SELECT CONVERT(varchar(36), job_id) AS job_id, step_id, step_name, subsystem, command, database_name FROM dbo.sysjobsteps`,
  servers: `SELECT CONVERT(varchar(36), job_id) AS job_id, last_run_outcome, last_outcome_message, last_run_date, last_run_time, last_run_duration FROM dbo.sysjobservers`,
  activity: `SELECT CONVERT(varchar(36), job_id) AS job_id, start_execution_date, stop_execution_date, next_scheduled_run_date
             FROM dbo.sysjobactivity WHERE session_id = (SELECT MAX(session_id) FROM dbo.syssessions)`,
}

export async function listJobs(conn, password) {
  return withPool({ ...conn, database: 'msdb' }, password, async (pool) => {
    const run = async (sql) => (await pool.request().query(sql)).recordset
    let jobs
    try {
      jobs = await run(Q.jobs)
    } catch (err) {
      throw new HttpError(502, `Could not read the SQL Server Agent jobs (msdb.dbo.sysjobs). The login needs a role such as SQLAgentReaderRole in msdb. ${err.message}`)
    }
    // The rest improves the picture but is not essential; a login with fewer rights still gets the job list.
    const soft = async (sql) => { try { return await run(sql) } catch { return [] } }
    const [schedules, steps, servers, activity, nowRow] = [
      await soft(Q.schedules), await soft(Q.steps), await soft(Q.servers), await soft(Q.activity), await soft('SELECT GETDATE() AS now'),
    ]
    return buildJobs({ jobs, schedules, steps, servers, activity, now: nowRow[0]?.now })
  })
}
