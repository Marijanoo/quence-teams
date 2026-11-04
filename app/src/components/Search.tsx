import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { api } from '../lib/api'
import { formatShort, plainText } from '../lib/format'
import { useStore } from '../lib/store'
import type { SearchHit } from '../lib/types'
import { useClickOutside } from './ui'

function highlight(text: string, q: string) {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (!terms.length) return text
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)
}

export function Search() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const users = useStore(s => s.users)
  const goTo = useStore(s => s.goTo)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  useEffect(() => {
    if (!q.trim()) { setHits(null); return }
    let alive = true
    const t = setTimeout(() => {
      api.search(q).then(r => { if (alive) setHits(r) }).catch(() => { if (alive) setHits([]) })
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  return (
    <div className="search" ref={ref}>
      <SearchIcon size={16} className="search-icon" />
      <input className="input" type="search" placeholder="Search messages" value={q} aria-label="Search messages"
        onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur() } }} />
      {open && q.trim() && (
        <div className="search-results">
          {hits === null && <div className="empty" style={{ padding: 16 }}>Searching…</div>}
          {hits?.length === 0 && <div className="empty" style={{ padding: 16 }}>No messages match “{q}”</div>}
          {hits && hits.length > 0 && <div className="section-label" style={{ padding: '4px 10px' }}>Messages</div>}
          {hits?.map(h => (
            <div key={h.message.id} className="search-hit" onClick={() => { setOpen(false); setQ(''); void goTo(h.message.convoId, h.message.id, h.message.parentId ?? undefined) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b>{h.message.author?.name}</b><span className="muted" style={{ fontSize: 12 }}>{formatShort(h.message.createdAt)}</span>
              </div>
              <div className="where">{h.where}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(plainText(h.message.body, users), q)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
