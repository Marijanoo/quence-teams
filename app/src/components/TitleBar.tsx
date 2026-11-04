import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Download, Minus, Square, X } from 'lucide-react'

const drag = { WebkitAppRegion: 'drag' } as CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

// Same anatomy as the title bar in the other Quence apps: logo + name on the left, draggable middle,
// window controls flush to the right. The window controls only exist inside the Electron app.
export function TitleBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  const desktop = window.teamsDesktop
  // null = nothing new, 0-99 = downloading, 'ready' = downloaded and waiting for a restart
  const [update, setUpdate] = useState<number | 'ready' | null>(null)
  useEffect(() => {
    desktop?.onUpdateAvailable(() => setUpdate(0))
    desktop?.onUpdateProgress(p => setUpdate(u => (u === 'ready' ? u : Math.round(p))))
    desktop?.onUpdateDownloaded(() => setUpdate('ready'))
  }, [desktop])
  return (
    <div className="titlebar" style={drag}>
      <div className="titlebar-brand" style={noDrag}>
        <img src="./logo.svg" alt="" width={14} height={14} />
        <span className="muted-name">Quence</span><span className="strong-name">Teams</span>
      </div>
      <div className="titlebar-sep" />
      <div className="titlebar-mid">{children}</div>
      <div className="titlebar-right" style={noDrag}>
        {update === 'ready' && (
          <button className="update-btn" onClick={() => desktop?.installUpdate()} title="Restart to install the new version">
            <Download size={13} /> Update ready, restart
          </button>
        )}
        {typeof update === 'number' && <span className="update-progress">Updating… {update}%</span>}
        {right}
      </div>
      {desktop && (
        <div className="win-controls" style={noDrag}>
          <button onClick={() => desktop.minimize()} tabIndex={-1} aria-label="Minimize"><Minus size={14} /></button>
          <button onClick={() => desktop.maximize()} tabIndex={-1} aria-label="Maximize"><Square size={12} /></button>
          <button className="close" onClick={() => desktop.close()} tabIndex={-1} aria-label="Close"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}
