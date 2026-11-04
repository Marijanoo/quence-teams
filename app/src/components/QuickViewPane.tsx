import { useEffect, useState } from 'react'
import { ArrowLeft, AtSign, Bookmark, BookmarkX, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import { formatShort, plainText } from '../lib/format'
import { convoName, useStore } from '../lib/store'
import type { SearchHit } from '../lib/types'
import { Avatar } from './ui'

// Main-pane lists for the quick views: Mentions, Drafts and Saved.
export function QuickViewPane() {
  const view = useStore(s => s.quickView)!
  const users = useStore(s => s.users)
  const drafts = useStore(s => s.drafts)
  const savedIds = useStore(s => s.savedIds)
  const goTo = useStore(s => s.goTo)
  const toggleSaved = useStore(s => s.toggleSaved)
  const toast = useStore(s => s.toast)
  const setQuick = useStore(s => s.setQuick)
  const state = useStore.getState
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useEffect(() => {
    setHits(null)
    if (view === 'drafts') return
    let alive = true
    const load = view === 'mentions' ? api.mentions() : api.saved()
    load.then(r => { if (alive) setHits(r) }).catch(e => { if (alive) { setHits([]); toast(e.message, 'error') } })
    return () => { alive = false }
  }, [view, toast, view === 'saved' ? savedIds.length : 0])

  const title = view === 'mentions' ? 'Mentions' : view === 'drafts' ? 'Drafts' : 'Saved'
  const icon = view === 'mentions' ? <AtSign size={20} /> : view === 'drafts' ? <Pencil size={20} /> : <Bookmark size={20} />
  const draftList = Object.entries(drafts).filter(([k]) => !k.includes('#')).sort((a, b) => b[1].at - a[1].at)

  return (
    <div className="main">
      <div className="convo-head" style={{ paddingBottom: 12 }}>
        <div className="head-row"><button className="icon-btn back-btn" onClick={() => setQuick(null)} aria-label="Back"><ArrowLeft size={18} /></button><h2>{icon}<span className="t">{title}</span></h2></div>
      </div>
      <div className="quick-list">
        {view === 'drafts' && draftList.map(([convoId, d]) => (
          <div key={convoId} role="button" tabIndex={0} className="quick-item" onClick={() => void goTo(convoId)} onKeyDown={e => { if (e.key === 'Enter') void goTo(convoId) }}>
            <div className="quick-ico big"><Pencil size={16} /></div>
            <div className="grow">
              <div className="quick-top"><b>{convoName(state(), convoId)}</b><span className="muted">{formatShort(d.at)}</span></div>
              <div className="quick-text">{plainText(d.text, users)}</div>
            </div>
          </div>
        ))}
        {view !== 'drafts' && hits?.map(h => (
          <div key={h.message.id} role="button" tabIndex={0} className="quick-item"
            onClick={() => void goTo(h.message.convoId, h.message.id, h.message.parentId ?? undefined)}
            onKeyDown={e => { if (e.key === 'Enter') void goTo(h.message.convoId, h.message.id, h.message.parentId ?? undefined) }}>
            <Avatar user={h.message.author} size={36} />
            <div className="grow">
              <div className="quick-top"><b>{h.message.author?.name}</b><span className="muted">{h.where} · {formatShort(h.message.createdAt)}</span></div>
              <div className="quick-text">{plainText(h.message.body, users) || 'Attachment'}</div>
            </div>
            {view === 'saved' && (
              <button className="icon-btn" title="Remove from saved" aria-label="Remove from saved"
                onClick={e => { e.stopPropagation(); setHits(list => list?.filter(x => x.message.id !== h.message.id) ?? null); void toggleSaved(h.message.id) }}><BookmarkX size={16} /></button>
            )}
          </div>
        ))}
        {view !== 'drafts' && hits === null && <div className="empty">Loading…</div>}
        {((view === 'drafts' && !draftList.length) || (view !== 'drafts' && hits?.length === 0)) && (
          <div className="empty" style={{ marginTop: 40 }}>
            <div style={{ color: 'var(--accent)' }}>{icon}</div>
            <h3>{view === 'mentions' ? 'No mentions yet' : view === 'drafts' ? 'No drafts' : 'Nothing saved'}</h3>
            <div>{view === 'mentions' ? 'Messages that @mention you show up here.' : view === 'drafts' ? 'Messages you started but did not send are kept here.' : 'Save a message from its hover toolbar to find it again here.'}</div>
          </div>
        )}
      </div>
    </div>
  )
}
