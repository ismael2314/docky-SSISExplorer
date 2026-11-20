// Colour palette: presets plus per-colour overrides, saved in this browser.
// Applying a palette sets CSS variables on <html>, so every component (and both light and dark mode)
// picks it up immediately.
import { useSyncExternalStore } from 'react'

const KEY = 'docky-palette-v1'

// What can be configured, grouped for the settings screen: [token, label, where it is used]
export const TOKEN_GROUPS = [
  {
    group: 'Brand',
    items: [
      ['primary', 'Primary', 'Buttons, links, selection'],
      ['sidebar', 'Sidebar', 'Navigation background'],
    ],
  },
  {
    group: 'Status',
    items: [
      ['success', 'Success', 'Succeeded, found, all good'],
      ['warning', 'Warning', 'Needs attention, not uploaded'],
      ['danger', 'Error', 'Failed, loops, deletions'],
      ['info', 'Info', 'Notes, running, neutral highlights'],
    ],
  },
  {
    group: 'Task types',
    items: [
      ['package', 'Packages', 'Execute Package tasks'],
      ['dataflow', 'Data flows', 'Data Flow tasks'],
      ['sql', 'SQL tasks', 'Execute SQL tasks'],
      ['container', 'Containers', 'Sequence and loop containers'],
      ['source', 'Sources', 'Data flow sources'],
      ['destination', 'Destinations', 'Data flow destinations'],
      ['transform', 'Transforms', 'Data flow transformations'],
      ['mail', 'Mail', 'Send Mail tasks'],
      ['script', 'Scripts', 'Script tasks'],
      ['other', 'Other', 'Everything else'],
    ],
  },
]

const KINDS = {
  package: '#8b5cf6', dataflow: '#0d9488', sql: '#2563eb', container: '#64748b', source: '#0ea5e9',
  destination: '#16a34a', transform: '#f97316', mail: '#e11d48', script: '#d946ef', other: '#94a3b8',
}
const STATUS = { success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#0284c7' }

export const PRESETS = [
  { id: 'corporate', name: 'Corporate', note: 'Blue on navy', colors: { primary: '#2563eb', sidebar: '#0f1c33', ...STATUS, ...KINDS } },
  { id: 'emerald', name: 'Emerald', note: 'Green on deep teal', colors: { primary: '#059669', sidebar: '#0c2a24', ...STATUS, ...KINDS, package: '#7c3aed' } },
  { id: 'violet', name: 'Violet', note: 'Purple on indigo', colors: { primary: '#7c3aed', sidebar: '#1c1433', ...STATUS, ...KINDS, package: '#4f46e5', script: '#c026d3' } },
  { id: 'sunset', name: 'Sunset', note: 'Orange on brown', colors: { primary: '#ea580c', sidebar: '#2b1a12', ...STATUS, ...KINDS, transform: '#ca8a04' } },
  { id: 'graphite', name: 'Graphite', note: 'Neutral and calm', colors: { primary: '#3f3f46', sidebar: '#18181b', ...STATUS, ...KINDS } },
  { id: 'light', name: 'Light', note: 'White sidebar', colors: { primary: '#2563eb', sidebar: '#f8fafc', ...STATUS, ...KINDS } },
  {
    id: 'accessible', name: 'Colour-blind safe', note: 'Distinguishable for all colour vision',
    colors: {
      primary: '#0072b2', sidebar: '#0b2540',
      success: '#009e73', warning: '#e69f00', danger: '#d55e00', info: '#56b4e9',
      package: '#cc79a7', dataflow: '#009e73', sql: '#0072b2', container: '#6b7280', source: '#56b4e9',
      destination: '#e69f00', transform: '#d55e00', mail: '#7b5ea7', script: '#b8860b', other: '#9ca3af',
    },
  },
]

const DEFAULT_ID = 'corporate'
const preset = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]

// ---------- colour maths ----------
const rgb = (hex) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const readableOn = (hex) => (luminance(hex) > 0.4 ? '#0b1220' : '#ffffff')
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

// ---------- state ----------
let state = load()
const listeners = new Set()

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const overrides = Object.fromEntries(Object.entries(raw.overrides ?? {}).filter(([, v]) => isHex(v)))
      return { preset: preset(raw.preset).id, overrides }
    }
  } catch { /* ignore */ }
  return { preset: DEFAULT_ID, overrides: {} }
}

export const colorsOf = (s = state) => ({ ...preset(s.preset).colors, ...s.overrides })

export function applyPalette(s = state) {
  if (typeof document === 'undefined') return
  const c = colorsOf(s)
  const root = document.documentElement.style
  const set = (k, v) => root.setProperty(k, v)

  const onSidebar = readableOn(c.sidebar)
  set('--primary', c.primary)
  set('--primary-foreground', readableOn(c.primary))
  set('--ring', c.primary)
  set('--sidebar', c.sidebar)
  set('--sidebar-foreground', onSidebar)
  set('--sidebar-accent', mix(c.sidebar, onSidebar, 0.1))
  set('--sidebar-accent-foreground', onSidebar)
  set('--sidebar-border', mix(c.sidebar, onSidebar, 0.14))
  set('--sidebar-primary', luminance(c.sidebar) < 0.2 ? mix(c.primary, '#ffffff', 0.25) : c.primary)
  set('--sidebar-primary-foreground', readableOn(c.primary))
  for (const k of ['success', 'warning', 'danger', 'info']) set(`--${k}`, c[k])
  for (const k of ['package', 'dataflow', 'sql', 'container', 'source', 'destination', 'transform', 'mail', 'script', 'other'])
    set(`--kind-${k}`, c[k])
}

function commit(next) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage blocked */ }
  applyPalette(state)
  listeners.forEach((l) => l())
}

export const initPalette = () => applyPalette(state)
export const setPreset = (id) => commit({ preset: preset(id).id, overrides: {} })
export const setColor = (token, hex) => isHex(hex) && commit({ ...state, overrides: { ...state.overrides, [token]: hex.toLowerCase() } })
export const resetColor = (token) => {
  const { [token]: _gone, ...rest } = state.overrides
  commit({ ...state, overrides: rest })
}
export const resetPalette = () => commit({ preset: state.preset, overrides: {} })

export function usePalette() {
  const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => state)
  return { preset: s.preset, overrides: s.overrides, colors: colorsOf(s) }
}
