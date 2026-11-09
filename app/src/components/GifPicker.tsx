import { useEffect, useState } from 'react'
import { api } from '../lib/api'

type Gif = Awaited<ReturnType<typeof api.gifs>>[number]

// Search (or trending when empty) and click to send. The picture is fetched by the server, not by the people in the chat.
export function GifPicker({ onPick }: { onPick: (g: Gif) => void }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState<Gif[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setError('')
    const t = setTimeout(() => {
      api.gifs(q).then(r => { if (alive) setGifs(r) }).catch(e => { if (alive) { setGifs([]); setError((e as Error).message) } })
    }, q ? 300 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  return (
    <div className="gif-pop">
      <input className="input" autoFocus placeholder="Search GIFs" value={q} onChange={e => setQ(e.target.value)} />
      <div className="gif-grid">
        {gifs === null && <div className="muted" style={{ padding: 12 }}>Loading…</div>}
        {error && <div className="muted" style={{ padding: 12 }}>{error}</div>}
        {!error && gifs?.length === 0 && <div className="muted" style={{ padding: 12 }}>No GIFs found</div>}
        {gifs?.map(g => <button key={g.id} onClick={() => onPick(g)} title={g.title}><img src={g.preview} alt={g.title} loading="lazy" /></button>)}
      </div>
      <div className="muted" style={{ fontSize: 11, padding: '4px 2px 0' }}>Powered by GIPHY</div>
    </div>
  )
}
