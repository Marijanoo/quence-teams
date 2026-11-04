import { useEffect, useState } from 'react'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

// Same bar as the other Quence apps: a thin progress track under the title bar while an update downloads,
// then "Restart to update" / "Later" once it is ready. Only exists inside the desktop app.
export function UpdateBar() {
  const desktop = window.teamsDesktop
  const [progress, setProgress] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    desktop?.onUpdateAvailable(() => setProgress(0))
    desktop?.onUpdateProgress(p => setProgress(p))
    desktop?.onUpdateDownloaded(() => { setProgress(100); setDownloaded(true) })
  }, [desktop])

  if (progress === null) return null
  return (
    <div className="update-bar" role="status">
      <div className="update-track">
        <div className="update-fill" style={{ width: `${progress}%` }}>
          {!downloaded && <div className="update-shimmer" />}
        </div>
      </div>
      {downloaded ? (
        <div className="update-actions">
          <button className="update-primary" onClick={() => desktop?.installUpdate()}>{isMac ? 'Quit & update' : 'Restart to update'}</button>
          <span className="update-dot">·</span>
          <button className="update-later" onClick={() => { setProgress(null); setDownloaded(false) }}>Later</button>
        </div>
      ) : (
        <span className="update-text">Updating… {Math.round(progress)}%</span>
      )}
    </div>
  )
}
