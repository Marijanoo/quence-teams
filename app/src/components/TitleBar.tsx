import type { CSSProperties, ReactNode } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { UpdateBar } from './UpdateBar'

const drag = { WebkitAppRegion: 'drag' } as CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

// Same anatomy as the title bar in the other Quence apps: logo + name on the left, draggable middle,
// window controls flush to the right. The window controls only exist inside the Electron app.
export function TitleBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  const desktop = window.teamsDesktop
  return (
    <div className="top">
    <div className="titlebar" style={drag}>
      <div className="titlebar-brand" style={noDrag}>
        <img src="./logo.svg" alt="" width={14} height={14} />
        <span className="muted-name">Quence</span><span className="strong-name">Teams</span>
      </div>
      <div className="titlebar-sep" />
      <div className="titlebar-mid">{children}</div>
      <div className="titlebar-right" style={noDrag}>{right}</div>
      {desktop && (
        <div className="win-controls" style={noDrag}>
          <button onClick={() => desktop.minimize()} tabIndex={-1} aria-label="Minimize"><Minus size={14} /></button>
          <button onClick={() => desktop.maximize()} tabIndex={-1} aria-label="Maximize"><Square size={12} /></button>
          <button className="close" onClick={() => desktop.close()} tabIndex={-1} aria-label="Close"><X size={14} /></button>
        </div>
      )}
    </div>
    <UpdateBar />
    </div>
  )
}
