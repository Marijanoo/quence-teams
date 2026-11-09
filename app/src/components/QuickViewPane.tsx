import { useEffect, useState } from 'react'
import { AlarmClock, ArrowLeft, AtSign, Bookmark, BookmarkX, CalendarClock, Pencil, X } from 'lucide-react'
import { api } from '../lib/api'
import { formatShort, plainText } from '../lib/format'
import { convoName, useStore } from '../lib/store'
import type { Reminder, Scheduled, SearchHit } from '../lib/types'
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
  const [scheduled, setScheduled] = useState<Scheduled[] | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])

  useEffect(() => {
    setHits(null)
    if (view === 'drafts') return
    if (view === 'scheduled') {
      let on = true
      api.scheduled().then(r => { if (on) setScheduled(r) }).catch(e => { if (on) { setScheduled([]); toast(e.message, 'error') } })
      api.reminders().then(r => { if (on) setReminders(r) }).catch(() => {})
      return () => { on = false }
    }
    let alive = true
    const load = view === 'mentions' ? api.mentions() : api.saved()
    load.then(r => { if (alive) setHits(r) }).catch(e => { if (alive) { setHits([]); toast(e.message, 'error') } })
    return () => { alive = false }
  }, [view, toast, view === 'saved' ? savedIds.length : 0])

  const title = view === 'mentions' ? 'Mentions' : view === 'drafts' ? 'Drafts' : view === 'scheduled' ? 'Scheduled and reminders' : 'Saved'
  const icon = view === 'mentions' ? <AtSign size={20} /> : view === 'drafts' ? <Pencil size={20} /> : view === 'scheduled' ? <CalendarClock size={20} /> : <Bookmark size={20} />
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
        {view === 'scheduled' && (
          <>
            {scheduled?.map(s => (
              <div key={s.id} className="quick-item">
                <div className="quick-ico big"><CalendarClock size={16} /></div>
                <div className="grow">
                  <div className="quick-top"><b>{s.where}</b><span className="muted">sends {new Date(s.sendAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                  <div className="quick-text">{plainText(s.body, users)}</div>
                </div>
                <button className="icon-btn" title="Cancel this message" aria-label="Cancel this scheduled message"
                  onClick={() => { setScheduled(l => l?.filter(x => x.id !== s.id) ?? null); void api.cancelScheduled(s.id).catch(e => toast(e.message, 'error')) }}><X size={16} /></button>
              </div>
            ))}
            {reminders.map(r => (
              <div key={r.id} className="quick-item" role={r.convoId ? 'button' : undefined} onClick={() => { if (r.convoId) void goTo(r.convoId, r.messageId ?? undefined) }}>
                <div className="quick-ico big"><AlarmClock size={16} /></div>
                <div className="grow">
                  <div className="quick-top"><b>{r.text || 'Reminder about a message'}</b><span className="muted">{new Date(r.remindAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                </div>
                <button className="icon-btn" title="Cancel reminder" aria-label="Cancel reminder"
                  onClick={e => { e.stopPropagation(); setReminders(l => l.filter(x => x.id !== r.id)); void api.cancelReminder(r.id).catch(err => toast(err.message, 'error')) }}><X size={16} /></button>
              </div>
            ))}
            {scheduled === null && <div className="empty">Loading…</div>}
            {scheduled?.length === 0 && reminders.length === 0 && (
              <div className="empty" style={{ marginTop: 40 }}>
                <div style={{ color: 'var(--accent)' }}>{icon}</div>
                <h3>Nothing scheduled</h3>
                <div>Use the clock button in the message box to send later, or “Remind me” on a message.</div>
              </div>
            )}
          </>
        )}
        {view !== 'drafts' && view !== 'scheduled' && hits?.map(h => (
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
        {view !== 'drafts' && view !== 'scheduled' && hits === null && <div className="empty">Loading…</div>}
        {((view === 'drafts' && !draftList.length) || (view !== 'drafts' && view !== 'scheduled' && hits?.length === 0)) && (
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
