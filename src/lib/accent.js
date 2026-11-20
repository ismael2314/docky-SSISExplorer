// Optional accent colour on top of the light/dark theme. Stored per browser.
const KEY = 'docky-accent'

export const ACCENTS = [
  { id: 'default', label: 'Default', swatch: 'oklch(0.45 0 0)' },
  { id: 'blue', label: 'Blue', color: 'oklch(0.55 0.2 260)' },
  { id: 'green', label: 'Green', color: 'oklch(0.58 0.15 150)' },
  { id: 'orange', label: 'Orange', color: 'oklch(0.66 0.18 50)' },
  { id: 'rose', label: 'Rose', color: 'oklch(0.6 0.22 15)' },
  { id: 'violet', label: 'Violet', color: 'oklch(0.56 0.22 300)' },
]

const VARS = ['--primary', '--primary-foreground', '--ring', '--sidebar-primary']

export function getAccent() {
  try { return localStorage.getItem(KEY) ?? 'default' } catch { return 'default' }
}

export function applyAccent(id) {
  const root = document.documentElement
  const accent = ACCENTS.find((a) => a.id === id)
  if (!accent?.color) {
    VARS.forEach((v) => root.style.removeProperty(v))
    return
  }
  root.style.setProperty('--primary', accent.color)
  root.style.setProperty('--primary-foreground', 'oklch(0.985 0 0)')
  root.style.setProperty('--ring', accent.color)
  root.style.setProperty('--sidebar-primary', accent.color)
}

export function setAccent(id) {
  try { localStorage.setItem(KEY, id) } catch { /* storage blocked */ }
  applyAccent(id)
}
