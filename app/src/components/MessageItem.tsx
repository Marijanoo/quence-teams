import { useState } from 'react'
import { CornerUpLeft, FileText, Pencil, Pin, PinOff, Smile, Trash2, Video, MessageSquareReply } from 'lucide-react'
import { api, fileUrl } from '../lib/api'
import { EMOJIS, formatBytes, formatTime, mentionsToDisplay, mentionsToRaw, renderBody } from '../lib/format'
import { useStore, convoName } from '../lib/store'
import type { Message } from '../lib/types'
import { Avatar, useClickOutside } from './ui'

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useClickOutside<HTMLDivElement>(onClose)
  return (
    <div ref={ref} className="popup" style={{ right: 0, top: '100%', marginTop: 4 }}>
      <div className="emoji-grid">
        {EMOJIS.map(e => <button key={e} onClick={() => { onPick(e); onClose() }} aria-label={`React ${e}`}>{e}</button>)}
      </div>
    </div>
  )
}

export function MessageItem({ msg, compact, inThread, canModerate, onReply, onImage }: {
  msg: Message; compact?: boolean; inThread?: boolean; canModerate?: boolean
  onReply?: (m: Message) => void; onImage?: (url: string) => void
}) {
  const me = useStore(s => s.me)!
  const users = useStore(s => s.users)
  const callParticipants = useStore(s => s.calls[msg.convoId])
  const joinCall = useStore(s => s.joinCall)
  const title = useStore(s => convoName(s, msg.convoId))
  const toast = useStore(s => s.toast)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [picker, setPicker] = useState(false)

  const mine = msg.author?.id === me.id
  const run = (p: Promise<unknown>) => p.catch(e => toast((e as Error).message, 'error'))

  async function saveEdit() {
    const raw = mentionsToRaw(draft, Object.values(users))
    if (raw.trim() === msg.body.trim()) return setEditing(false)
    await run(api.edit(msg.id, raw))
    setEditing(false)
  }

  if (msg.deleted) {
    return (
      <div className={`msg deleted${compact ? ' compact' : ''}`} data-id={msg.id}>
        <div className="avatar-slot"><Avatar user={msg.author} size={36} /></div>
        <div className="text">This message was deleted.</div>
      </div>
    )
  }

  return (
    <div className={`msg${compact ? ' compact' : ''}${msg.pinned ? ' pinned' : ''}${picker ? ' menu-open' : ''}`} data-id={msg.id}>
      <div className="avatar-slot"><Avatar user={msg.author} size={36} presence /></div>
      <div style={{ minWidth: 0 }}>
        {!compact && (
          <div className="meta">
            <span className="author">{msg.author?.name ?? 'Unknown'}</span>
            <span className="stamp">{formatTime(msg.createdAt)}</span>
            {msg.editedAt && <span className="edited">(edited)</span>}
          </div>
        )}
        {msg.subject && <div className="subject">{msg.subject}</div>}

        {msg.kind === 'call' ? (
          <div className={`call-card${callParticipants?.length ? ' live' : ''}`}>
            <div className="ico"><Video size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Meeting in {title}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {callParticipants?.length ? `${callParticipants.length} in the call` : 'Not running'}
              </div>
            </div>
            <button className="btn primary sm" onClick={() => joinCall(msg.convoId, title)}>Join</button>
          </div>
        ) : editing ? (
          <div>
            <textarea className="input" rows={3} value={draft} autoFocus onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit() } if (e.key === 'Escape') setEditing(false) }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn primary sm" onClick={saveEdit}>Save</button>
              <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          msg.body && <div className="text">{renderBody(msg.body, users, me.id)}</div>
        )}

        {msg.attachments.length > 0 && (
          <div className="attachments">
            {msg.attachments.map(a => /^image\/(png|jpe?g|gif|webp)$/.test(a.mime)
              ? <img key={a.id} className="attach-img" src={fileUrl(a.id)} alt={a.name} loading="lazy" onClick={() => onImage?.(fileUrl(a.id))} />
              : <a key={a.id} className="attach-file" href={fileUrl(a.id, true)} download={a.name}>
                  <FileText size={20} /><div style={{ minWidth: 0 }}><div className="name">{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{formatBytes(a.size)}</div></div>
                </a>)}
          </div>
        )}

        {msg.reactions.length > 0 && (
          <div className="reactions">
            {msg.reactions.map(r => {
              const has = r.userIds.includes(me.id)
              return (
                <button key={r.emoji} className={`reaction${has ? ' mine' : ''}`} onClick={() => run(api.react(msg.id, r.emoji, !has))}
                  title={r.userIds.map(id => users[id]?.name ?? 'someone').join(', ')}>
                  <span>{r.emoji}</span><span>{r.userIds.length}</span>
                </button>
              )
            })}
          </div>
        )}

        {!inThread && msg.replyCount > 0 && (
          <button className="thread-link" onClick={() => onReply?.(msg)}>
            <MessageSquareReply size={14} /> {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {!editing && (
        <div className="toolbar">
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" title="React" onClick={() => setPicker(p => !p)}><Smile size={16} /></button>
            {picker && <EmojiPicker onPick={e => run(api.react(msg.id, e, !msg.reactions.find(r => r.emoji === e)?.userIds.includes(me.id)))} onClose={() => setPicker(false)} />}
          </div>
          {!inThread && msg.kind === 'text' && <button className="icon-btn" title="Reply" onClick={() => onReply?.(msg)}><CornerUpLeft size={16} /></button>}
          {mine && msg.kind === 'text' && <button className="icon-btn" title="Edit" onClick={() => { setDraft(mentionsToDisplay(msg.body, users)); setEditing(true) }}><Pencil size={16} /></button>}
          {!inThread && <button className="icon-btn" title={msg.pinned ? 'Unpin' : 'Pin'} onClick={() => run(api.pin(msg.id, !msg.pinned))}>{msg.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
          {(mine || canModerate) && <button className="icon-btn" title="Delete" onClick={() => { if (confirm('Delete this message?')) void run(api.remove(msg.id)) }}><Trash2 size={16} /></button>}
        </div>
      )}
    </div>
  )
}
