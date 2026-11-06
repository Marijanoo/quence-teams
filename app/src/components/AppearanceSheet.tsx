import { useState } from 'react'
import { X } from 'lucide-react'
import { ACCENT_PRESETS, SEASON_PRESETS, currentSeason, DEFAULTS, applyAppearance, loadAppearance, saveAppearance, sanitize, type Appearance } from '../lib/appearance'
import { useStore } from '../lib/store'

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="sp-slider">
      <span><span>{label}</span><span className="sp-dim">{format ? format(value) : value.toFixed(2)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}

// Docked to the right of the app (same as the settings panel in the other Quence apps), not a popup.
export function AppearanceSheet() {
  const open = useStore(s => s.appearanceOpen)
  const close = () => useStore.setState({ appearanceOpen: false })
  const [a, setA] = useState<Appearance>(loadAppearance)
  if (!open) return null

  const update = (fn: (p: Appearance) => Appearance) => setA(prev => {
    const next = sanitize(fn(prev))
    applyAppearance(next)
    saveAppearance(next)
    return next
  })
  const activePreset = a.season ? undefined : ACCENT_PRESETS.find(p => Math.abs(p.h - a.accent.h) < 6 && Math.abs(p.c - a.accent.c) < 0.05)
  const bg = (dl: number) => `oklch(${Math.min(1, Math.max(0, a.bgL + dl * (a.bgL <= 0.5 ? 1 : -1))).toFixed(3)} ${a.bgC} ${a.bgH})`

  return (
    <aside className="sheet" aria-label="Appearance" onKeyDown={e => { if (e.key === 'Escape') close() }}>
      <div className="sheet-head">
        <span>Appearance</span>
        <div>
          <button className="sheet-link" onClick={() => update(() => DEFAULTS)}>Reset</button>
          <button className="sheet-close" onClick={close} aria-label="Close appearance"><X size={16} /></button>
        </div>
      </div>
      <div className="sheet-body">
        <section>
          <h4>Accent color</h4>
          <div className="sp-presets">
            {ACCENT_PRESETS.map(p => (
              <button key={p.name} title={p.name} aria-label={p.name} aria-pressed={activePreset?.name === p.name}
                onClick={() => update(prev => ({ ...prev, season: false, accent: { l: p.l, c: p.c, h: p.h } }))}>
                <i className={activePreset?.name === p.name ? 'on' : ''} style={{ background: `oklch(${p.l} ${p.c} ${p.h})` }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <h4 style={{ marginTop: 12 }}>Seasons</h4>
          <div className="sp-presets">
            {SEASON_PRESETS.map(p => (
              <button key={p.name} title={p.name} aria-label={p.name} aria-pressed={!a.season && activePreset?.name === p.name}
                onClick={() => update(prev => ({ ...prev, season: false, accent: { l: p.l, c: p.c, h: p.h } }))}>
                <i className={!a.season && Math.abs(p.h - a.accent.h) < 6 && Math.abs(p.c - a.accent.c) < 0.05 ? 'on' : ''} style={{ background: `oklch(${p.l} ${p.c} ${p.h})` }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
            <input type="checkbox" checked={a.season} onChange={e => update(p => ({ ...p, season: e.target.checked }))} />
            Follow the season (now: {currentSeason().name})
          </label>
          <Slider label="Hue" value={a.accent.h} min={0} max={359} step={1} format={v => `${Math.round(v)}°`} onChange={h => update(p => ({ ...p, season: false, accent: { ...p.accent, h } }))} />
          <Slider label="Intensity" value={a.accent.c} min={0} max={0.3} step={0.005} onChange={c => update(p => ({ ...p, season: false, accent: { ...p.accent, c } }))} />
          <Slider label="Lightness" value={a.accent.l} min={0.35} max={0.9} step={0.01} onChange={l => update(p => ({ ...p, season: false, accent: { ...p.accent, l } }))} />
          <div className="sp-swatch" style={{ background: a.season ? `oklch(${currentSeason().l} ${currentSeason().c} ${currentSeason().h})` : `oklch(${a.accent.l} ${a.accent.c} ${a.accent.h})` }} />
        </section>
        <hr />
        <section>
          <h4>Background</h4>
          <Slider label="Lightness" value={a.bgL} min={0.05} max={0.95} step={0.01} onChange={bgL => update(p => ({ ...p, bgL }))} />
          <Slider label="Tint" value={a.bgC} min={0} max={0.08} step={0.005} onChange={bgC => update(p => ({ ...p, bgC }))} />
          <Slider label="Hue" value={a.bgH} min={0} max={359} step={1} format={v => `${Math.round(v)}°`} onChange={bgH => update(p => ({ ...p, bgH }))} />
          <div className="sp-swatches">
            {([['BG', 0], ['Card', 0.04], ['Secondary', 0.1], ['Border', 0.14]] as const).map(([n, d]) => (
              <div key={n}><i style={{ background: bg(d) }} /><span>{n}</span></div>
            ))}
          </div>
        </section>
        <hr />
        <section>
          <h4>Text</h4>
          <Slider label="Brightness" value={a.fgL} min={0} max={1} step={0.01} onChange={fgL => update(p => ({ ...p, fgL }))} />
        </section>
        <p className="sp-dim" style={{ margin: 0, fontSize: 11.5 }}>Zoom the whole app with Ctrl and + / −. More options are in Settings from your profile menu.</p>
      </div>
    </aside>
  )
}
