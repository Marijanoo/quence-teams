import { useEffect, useState } from 'react'
import { isNative } from '../lib/platform'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

// Same bar as the other Quence apps: a thin progress track under the title bar while an update downloads,
// then "Restart to update" / "Later" once it is ready. On Android there is no store, so the bar offers the new APK.
export function UpdateBar() {
  const desktop = window.teamsDesktop
  const [progress, setProgress] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [apk, setApk] = useState<{ version: string; url: string } | null>(null)

  useEffect(() => {
    desktop?.onUpdateAvailable(() => setProgress(0))
    desktop?.onUpdateProgress(p => setProgress(p))
    desktop?.onUpdateDownloaded(() => { setProgress(100); setDownloaded(true) })
  }, [desktop])

  useEffect(() => {
    if (!isNative) return
    let live = true
    const check = async () => {
      try {
        const rel = await (await fetch('https://api.github.com/repos/Marijanoo/quence-teams/releases/latest')).json()
        const version = String(rel.tag_name ?? '').replace(/^v/, '')
        const asset = (rel.assets ?? []).find((a: { name: string }) => a.name.endsWith('.apk'))
        if (live && asset && newer(version, __APP_VERSION__)) setApk({ version, url: asset.browser_download_url })
      } catch { /* offline: try again later */ }
    }
    void check()
    const t = setInterval(check, 6 * 3600_000)
    return () => { live = false; clearInterval(t) }
  }, [])

  if (apk) {
    return (
      <div className="update-bar" role="status">
        <span className="update-text" style={{ flex: 1 }}>Version {apk.version} is available</span>
        <div className="update-actions">
          <button className="update-primary" onClick={() => window.open(apk.url, '_blank')}>Download</button>
          <span className="update-dot">·</span>
          <button className="update-later" onClick={() => setApk(null)}>Later</button>
        </div>
      </div>
    )
  }
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
