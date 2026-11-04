import { useState, type MutableRefObject } from 'react'
import { Bookmark, BookmarkCheck, CornerUpLeft, FileText, Pencil, Pin, PinOff, Smile, Trash2, Video, MessageSquareReply, Paperclip } from 'lucide-react'
import { api, fileUrl } from '../lib/api'
import { EMOJIS, formatBytes, formatTime, mentionsToDisplay, mentionsToRaw, plainText, renderBody } from '../lib/format'
import { askConfirm, convoName, useStore } from '../lib/store'
import type { Message } from '../lib/types'
import { Avatar, useClickOutside, useKeepInViewport } from './ui'

const QUICK = EMOJIS.slice(0, 6)

function ReactionPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const outside = useClickOutside<HTMLDivElement>(onClose)
  const fit = useKeepInViewport<HTMLDivElement>()
  const [more, setMore] = useState(false)
  return (
    <div ref={el => { (outside as MutableRefObject<HTMLDivElement | null>).current = el; (fit as MutableRefObject<HTMLDivElement | null>).current = el }} className="popup" style={{ left: 0, top: '100%', marginTop: 4, padding: 4 }}>
      {more
        ? <div className="emoji-grid">{EMOJIS.map(e => <button key={e} onClick={() => { onPick(e); onClose() }} aria-label={`React ${e}`}>{e}</button>)}</div>
        : <div className="quick" style={{ display: 'flex' }}>
            {QUICK.map(e => <button key={e} onClick={() => { onPick(e); onClose() }} aria-label={`React ${e}`}>{e}</button>)}
            <button onClick={() => setMore(true)} aria-label="More reactions" title="More" style={{ fontSize: 14 }}>•••</button>
          </div>}
    </div>
  )
}

// What a quoted message looks like inside a bubble (Teams-style quote block).
export function QuoteBlock({ msg, onJump }: { msg: NonNullable<Message['replyTo']>; onJump?: () => void }) {
  const users = useStore(s => s.users)
  return (
    <button type="button" className="quote" onClick={onJump} title="Go to the original message">
      <span className="quote-author">{msg.author?.name ?? 'Someone'}</span>
      <span className="quote-text">
        {msg.deleted ? 'This message was deleted' : (plainText(msg.snippet, users) || (msg.hasAttachment ? 'Attachment' : ''))}
        {!msg.deleted && msg.hasAttachment && msg.snippet && <Paperclip size={11} style={{ marginLeft: 6, verticalAlign: -1 }} />}
      </span>
    </button>
  )
}

export function MessageItem({ msg, compact, inThread, canModerate, onReply, onQuote, onImage }: {
  msg: Message; compact?: boolean; inThread?: boolean; canModerate?: boolean
  onReply?: (m: Message) => void      // open the thread (channels)
  onQuote?: (m: Message) => void      // quote-reply (chats)
  onImage?: (url: string) => void
}) {
  const me = useStore(s => s.me)!
  const users = useStore(s => s.users)
  const callParticipants = useStore(s => s.calls[msg.convoId])
  const joinCall = useStore(s => s.joinCall)
  const goTo = useStore(s => s.goTo)
  const saved = useStore(s => s.savedIds.includes(msg.id))
  const toggleSaved = useStore(s => s.toggleSaved)
  const title = useStore(s => convoName(s, msg.convoId))
  const toast = useStore(s => s.toast)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [picker, setPicker] = useState(false)

  const mine = msg.author?.id === me.id
  const run = (p: Promise<unknown>) => p.catch(e => toast((e as Error).message, 'error'))
  const react = (emoji: string) => run(api.react(msg.id, emoji, !msg.reactions.find(r => r.emoji === emoji)?.userIds.includes(me.id)))

  async function saveEdit() {
    const raw = mentionsToRaw(draft, Object.values(users))
    if (raw.trim() === msg.body.trim()) return setEditing(false)
    await run(api.edit(msg.id, raw))
    setEditing(false)
  }

  const cls = `msg${mine ? ' mine' : ''}${compact ? ' compact' : ''}${picker ? ' menu-open' : ''}`

  if (msg.deleted) {
    return (
      <div className={`${cls} deleted`} data-id={msg.id}>
        {!mine && <div className="avatar-slot"><Avatar user={msg.author} size={36} /></div>}
        <div className="msg-col"><div className="bubble">This message was deleted.</div></div>
      </div>
    )
  }

  return (
    <div className={cls + (msg.id.startsWith('pending-') ? ' pending' : '')} data-id={msg.id}>
      {!mine && <div className="avatar-slot"><Avatar user={msg.author} size={36} presence /></div>}
      <div className="msg-col">
        {!compact && (
          <div className="meta">
            {!mine && <span className="author">{msg.author?.name ?? 'Unknown'}</span>}
            <span className="stamp">{formatTime(msg.createdAt)}</span>
            {msg.editedAt && <span className="edited">(edited)</span>}
            {saved && <BookmarkCheck size={12} color="var(--accent)" aria-label="Saved" />}
          </div>
        )}

        {msg.kind === 'call' ? (
          <div className={`call-card${callParticipants?.length ? ' live' : ''}`}>
            <div className="ico"><Video size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Meeting in {title}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{callParticipants?.length ? `${callParticipants.length} in the call` : 'Not running'}</div>
            </div>
            <button className="btn primary sm" onClick={() => joinCall(msg.convoId, title)}>Join</button>
          </div>
        ) : (
          <div className={`bubble${msg.pinned ? ' pinned' : ''}`}>
            {msg.replyTo && <QuoteBlock msg={msg.replyTo} onJump={() => void goTo(msg.convoId, msg.replyTo!.id)} />}
            {msg.subject && <div className="subject">{msg.subject}</div>}
            {editing ? (
              <div style={{ minWidth: 260 }}>
                <textarea className="input" rows={3} value={draft} autoFocus onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit() } if (e.key === 'Escape') setEditing(false) }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn primary sm" onClick={saveEdit}>Save</button>
                  <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : msg.body && <div className="text">{renderBody(msg.body, users, me.id)}</div>}

            {msg.attachments.length > 0 && (
              <div className="attachments">
                {msg.attachments.map(a => /^image\/(png|jpe?g|gif|webp)$/.test(a.mime)
                  ? <img key={a.id} className="attach-img" src={fileUrl(a.id)} alt={a.name} onClick={() => onImage?.(fileUrl(a.id))} />
                  : <a key={a.id} className="attach-file" href={fileUrl(a.id, true)} download={a.name}>
                      <FileText size={20} /><div style={{ minWidth: 0 }}><div className="name">{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{formatBytes(a.size)}</div></div>
                    </a>)}
              </div>
            )}
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

        {!editing && !msg.id.startsWith('pending-') && (
          <div className="toolbar">
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" title="React" onClick={() => setPicker(p => !p)}><Smile size={16} /></button>
              {picker && <ReactionPicker onPick={react} onClose={() => setPicker(false)} />}
            </div>
            {onQuote && msg.kind === 'text' && <button className="icon-btn" title="Reply" onClick={() => onQuote(msg)}><CornerUpLeft size={16} /></button>}
            {!onQuote && !inThread && msg.kind === 'text' && <button className="icon-btn" title="Reply" onClick={() => onReply?.(msg)}><CornerUpLeft size={16} /></button>}
            {mine && msg.kind === 'text' && <button className="icon-btn" title="Edit" onClick={() => { setDraft(mentionsToDisplay(msg.body, users)); setEditing(true) }}><Pencil size={16} /></button>}
            <button className="icon-btn" title={saved ? 'Remove from saved' : 'Save'} aria-pressed={saved} onClick={() => void toggleSaved(msg.id)}>{saved ? <BookmarkCheck size={16} color="var(--accent)" /> : <Bookmark size={16} />}</button>
            {!inThread && <button className="icon-btn" title={msg.pinned ? 'Unpin' : 'Pin'} onClick={() => run(api.pin(msg.id, !msg.pinned))}>{msg.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
            {(mine || canModerate) && <button className="icon-btn" title="Delete" onClick={async () => {
              if (await askConfirm({ title: 'Delete this message?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) void run(api.remove(msg.id))
            }}><Trash2 size={16} /></button>}
          </div>
        )}
      </div>
    </div>
  )
}
