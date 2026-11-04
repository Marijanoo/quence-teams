import { useCallback, useEffect, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { ACCENT_PRESETS, DEFAULTS, applyAppearance, loadAppearance, saveAppearance, sanitize, type Appearance } from '../lib/appearance'
import { useStore } from '../lib/store'
import { useClickOutside } from './ui'

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="sp-slider">
      <span><span>{label}</span><span className="sp-dim">{format ? format(value) : value.toFixed(2)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState<Appearance>(loadAppearance)
  const ref = useClickOutside<HTMLDivElement>(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (fn: (p: Appearance) => Appearance) => setA(prev => {
    const next = sanitize(fn(prev))
    applyAppearance(next)
    saveAppearance(next)
    return next
  })
  const activePreset = ACCENT_PRESETS.find(p => Math.abs(p.h - a.accent.h) < 6 && Math.abs(p.c - a.accent.c) < 0.05)

  return (
    <div className="settings-panel" ref={ref} role="dialog" aria-label="Settings">
      <div className="sp-head">
        <b>Settings</b>
        <span className="sp-dim">Appearance</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => update(() => DEFAULTS)}>Reset</button>
        <button className="icon-btn" aria-label="Close settings" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="sp-body">
        <section>
          <h4>Accent color</h4>
          <div className="sp-presets">
            {ACCENT_PRESETS.map(p => (
              <button key={p.name} title={p.name} aria-label={p.name} aria-pressed={activePreset?.name === p.name}
                onClick={() => update(prev => ({ ...prev, accent: { l: p.l, c: p.c, h: p.h } }))}>
                <i className={activePreset?.name === p.name ? 'on' : ''} style={{ background: `oklch(${p.l} ${p.c} ${p.h})` }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <Slider label="Hue" value={a.accent.h} min={0} max={359} step={1} format={v => `${Math.round(v)}°`} onChange={h => update(p => ({ ...p, accent: { ...p.accent, h } }))} />
          <Slider label="Intensity" value={a.accent.c} min={0} max={0.3} step={0.005} onChange={c => update(p => ({ ...p, accent: { ...p.accent, c } }))} />
          <Slider label="Lightness" value={a.accent.l} min={0.35} max={0.9} step={0.01} onChange={l => update(p => ({ ...p, accent: { ...p.accent, l } }))} />
        </section>
        <section>
          <h4>Background</h4>
          <Slider label="Lightness" value={a.bgL} min={0.05} max={0.95} step={0.01} onChange={bgL => update(p => ({ ...p, bgL }))} />
          <Slider label="Tint" value={a.bgC} min={0} max={0.08} step={0.005} onChange={bgC => update(p => ({ ...p, bgC }))} />
          <Slider label="Hue" value={a.bgH} min={0} max={359} step={1} format={v => `${Math.round(v)}°`} onChange={bgH => update(p => ({ ...p, bgH }))} />
        </section>
        <section>
          <h4>Text</h4>
          <Slider label="Brightness" value={a.fgL} min={0} max={1} step={0.01} onChange={fgL => update(p => ({ ...p, fgL }))} />
        </section>
        <p className="sp-dim" style={{ margin: 0, fontSize: 11.5 }}>Zoom the whole app with Ctrl and + / −.</p>
      </div>
    </div>
  )
}

// Same strip as the other Quence apps: settings on the left, version next to it, connection on the right.
export function BottomBar() {
  const [open, setOpen] = useState(false)
  const online = useStore(s => s.online)
  const signedIn = useStore(s => !!s.me)
  const close = useCallback(() => setOpen(false), [])
  const server = (() => { try { return new URL(window.location.protocol.startsWith('http') ? window.location.href : 'https://teams.kolaj.fun').host } catch { return '' } })()

  return (
    <footer className="bottombar">
      {open && <SettingsPanel onClose={close} />}
      <button className={`bb-btn${open ? ' active' : ''}`} onClick={() => setOpen(o => !o)} title="Settings" aria-expanded={open}>
        <Settings2 size={14} /><span>Settings</span>
      </button>
      <span className="bb-version">v{__APP_VERSION__}</span>
      <span style={{ flex: 1 }} />
      {signedIn && <span className="bb-status" title={online ? 'Connected' : 'Reconnecting'}><i className={online ? 'ok' : 'down'} />{online ? 'Connected' : 'Reconnecting…'}</span>}
      <span className="bb-server">{server}</span>
    </footer>
  )
}
