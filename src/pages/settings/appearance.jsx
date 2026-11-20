import { Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/page'
import { KindChip } from '@/components/icons'
import { Badge } from '@/components/form'
import { PRESETS, TOKEN_GROUPS, resetColor, resetPalette, setColor, setPreset, usePalette } from '@/lib/palette'

const MODES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

function PresetCard({ p, active }) {
  const c = p.colors
  return (
    <button
      type="button"
      onClick={() => setPreset(p.id)}
      aria-pressed={active}
      className={`overflow-hidden rounded-xl border text-left transition ${active ? 'border-primary ring-2 ring-primary/30' : 'hover:border-foreground/30'}`}
    >
      <div className="flex h-14">
        <div className="w-1/4" style={{ background: c.sidebar }} />
        <div className="flex flex-1 items-center gap-1.5 bg-muted/50 px-3">
          <span className="h-4 w-8 rounded" style={{ background: c.primary }} />
          {['package', 'dataflow', 'sql', 'destination'].map((k) => (
            <span key={k} className="h-3.5 w-3.5 rounded-full" style={{ background: c[k] }} />
          ))}
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-medium">{p.name}</div>
        <div className="text-xs text-muted-foreground">{p.note}</div>
      </div>
    </button>
  )
}

function ColorRow({ token, label, hint, value, changed }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <input
        type="color"
        value={value}
        onChange={(e) => setColor(token, e.target.value)}
        aria-label={`${label} colour`}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
      <code className="text-xs uppercase text-muted-foreground">{value}</code>
      <button
        type="button"
        onClick={() => resetColor(token)}
        disabled={!changed}
        title="Back to the preset's colour"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Shows the current palette on real components, so every change is visible straight away.
function Preview() {
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
      <div className="flex w-36 flex-col gap-1 rounded-lg bg-sidebar p-2 text-xs text-sidebar-foreground">
        <div className="rounded-md bg-sidebar-accent px-2 py-1.5 font-medium">Dashboard</div>
        <div className="px-2 py-1.5 text-sidebar-foreground/70">Hierarchy</div>
        <div className="px-2 py-1.5 text-sidebar-foreground/70">Jobs</div>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="outline">Secondary</Button>
          <Badge tone="ok">Succeeded</Badge>
          <Badge tone="warn">Not uploaded</Badge>
          <Badge tone="error">Failed</Badge>
          <Badge tone="info">Running</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {['package', 'dataflow', 'sql', 'container', 'source', 'destination', 'transform', 'mail', 'script', 'task'].map((k) => (
            <KindChip key={k} kind={k} size="sm" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const { preset, overrides, colors } = usePalette()
  const customised = Object.keys(overrides).length

  return (
    <div className="grid h-full gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-0 flex-col gap-6">
        <Card title="Mode" description="Light, dark, or follow your computer.">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Colour mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={theme === m.id}
                onClick={() => setTheme(m.id)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition ${
                  theme === m.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                }`}
              >
                <m.icon className="h-4 w-4" />
                {m.label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Palette" description="Start from a preset, then adjust any colour on the right." className="flex-1">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            {PRESETS.map((p) => <PresetCard key={p.id} p={p} active={preset === p.id} />)}
          </div>
        </Card>
      </div>

      <div className="flex min-h-0 flex-col gap-6">
        <Card title="Preview" description="Your colours on real components.">
          <Preview />
        </Card>

        <Card
          title="Customise colours"
          description={customised ? `${customised} changed from the ${PRESETS.find((p) => p.id === preset)?.name} preset` : 'Pick any colour. It applies everywhere at once.'}
          className="flex-1"
          action={
            <Button size="sm" variant="outline" disabled={!customised} onClick={resetPalette}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          }
        >
          {TOKEN_GROUPS.map((g) => (
            <div key={g.group} className="mb-4 last:mb-0">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</div>
              <div className="divide-y">
                {g.items.map(([token, label, hint]) => (
                  <ColorRow key={token} token={token} label={label} hint={hint} value={colors[token]} changed={token in overrides} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
