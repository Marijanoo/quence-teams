import { useEffect, useState, type MutableRefObject } from 'react'
import { AlarmClock, BarChart3, Check, ExternalLink, Bookmark, BookmarkCheck, CornerUpLeft, FileText, MoreHorizontal, Pencil, Pin, PinOff, Smile, SmilePlus, Trash2, Video, MessageSquareReply, Paperclip } from 'lucide-react'
import { api, fileUrl } from '../lib/api'
import { QUICK_REACTIONS, emojiOnlyCount, firstUrl, laterTimes, formatBytes, formatTime, mentionsToDisplay, mentionsToRaw, plainText, renderBody } from '../lib/format'
import { useSettings } from '../lib/settings'
import { askConfirm, convoName, useStore } from '../lib/store'
import type { EditVersion, LinkCard, Message, Poll } from '../lib/types'
import { Emoji, EmojiGrid, EmojiManager } from './CustomEmoji'
import { Avatar, useClickOutside, useKeepInViewport } from './ui'


// Quick reactions with a way to the full emoji grid.
function ReactionPicker({ onPick, onClose, align = 'left' }: { onPick: (e: string) => void; onClose: () => void; align?: 'left' | 'right' }) {
  const outside = useClickOutside<HTMLDivElement>(onClose)
  const fit = useKeepInViewport<HTMLDivElement>()
  const [more, setMore] = useState(false)
  return (
    <div ref={el => { (outside as MutableRefObject<HTMLDivElement | null>).current = el; (fit as MutableRefObject<HTMLDivElement | null>).current = el }}
      className="popup react-pop" style={{ [align]: 0, top: '100%', marginTop: 4, padding: 4 }}>
      {more
        ? <EmojiGrid onPick={e => { onPick(e); onClose() }} />
        : <div className="quick" style={{ display: 'flex' }}>
            {QUICK_REACTIONS.map(e => <button key={e} onClick={() => { onPick(e); onClose() }} aria-label={`React ${e}`}>{e}</button>)}
            <button onClick={() => setMore(true)} aria-label="More reactions" title="More" style={{ fontSize: 14 }}>•••</button>
          </div>}
    </div>
  )
}

// A card for the first link in a message. Fetched by the server (never by this device), cached per address.
const cards = new Map<string, Promise<LinkCard | null>>()
function LinkPreview({ url }: { url: string }) {
  const [card, setCard] = useState<LinkCard | null>(null)
  useEffect(() => {
    let alive = true
    if (!cards.has(url)) cards.set(url, api.preview(url).catch(() => null))
    cards.get(url)!.then(c => { if (alive) setCard(c) })
    return () => { alive = false }
  }, [url])
  if (!card) return null
  return (
    <a className="link-card" href={card.url} target="_blank" rel="noopener noreferrer">
      <div className="site">{card.site}<ExternalLink size={11} /></div>
      <div className="title">{card.title}</div>
      {card.description && <div className="desc">{card.description}</div>}
    </a>
  )
}

// "(edited)" opens the earlier versions of the message.
function EditHistory({ msg }: { msg: Message }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<EditVersion[] | null>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
  const fit = useKeepInViewport<HTMLDivElement>(open)
  const users = useStore(s => s.users)
  useEffect(() => { if (open) api.history(msg.id).then(setVersions).catch(() => setVersions([])) }, [open, msg.id, msg.editedAt])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="edited linkish" onClick={() => setOpen(o => !o)} title="See earlier versions">(edited)</button>
      {open && (
        <div ref={fit} className="menu history-pop" style={{ top: '100%', left: 0, marginTop: 4 }}>
          {versions === null ? <div className="muted" style={{ padding: 8 }}>Loading…</div> : [...versions].reverse().map((v, i) => (
            <div key={v.at} className="history-row">
              <div className="muted" style={{ fontSize: 11.5 }}>{i === 0 ? 'Current' : 'Earlier'} · {formatTime(v.at)}</div>
              <div>{plainText(v.body, users)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RemindMenu({ msgId, onClose, mine }: { msgId: string; onClose: () => void; mine: boolean }) {
  const ref = useClickOutside<HTMLDivElement>(onClose)
  const fit = useKeepInViewport<HTMLDivElement>()
  const toast = useStore(s => s.toast)
  return (
    <div ref={el => { (ref as MutableRefObject<HTMLDivElement | null>).current = el; (fit as MutableRefObject<HTMLDivElement | null>).current = el }}
      className="menu" style={{ top: '100%', [mine ? 'right' : 'left']: 0, marginTop: 4 }} role="menu">
      {laterTimes().map(r => (
        <button key={r.label} onClick={async () => { onClose(); try { await api.remind({ messageId: msgId, remindAt: r.at }); toast(`I will remind you ${r.label.toLowerCase()}`, 'info') } catch (e) { toast((e as Error).message, 'error') } }}>{r.label}</button>
      ))}
    </div>
  )
}

// A poll inside a bubble: click an option to vote, click it again to take the vote back.
function PollBlock({ msg, poll, meId }: { msg: Message; poll: Poll; meId: string }) {
  const toast = useStore(s => s.toast)
  const total = new Set(poll.options.flatMap(o => o.userIds)).size
  async function vote(optionId: string) {
    try { await api.vote(msg.id, optionId) } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="poll">
      <div className="poll-q"><BarChart3 size={15} />{msg.body}</div>
      <div className="poll-hint">{poll.multi ? 'Select all that apply' : 'Select one'}</div>
      {poll.options.map(o => {
        const mine = o.userIds.includes(meId)
        const pct = total ? Math.round((o.userIds.length / total) * 100) : 0
        return (
          <button key={o.id} className={`poll-opt${mine ? ' mine' : ''}`} onClick={() => void vote(o.id)} aria-pressed={mine}>
            <span className="poll-fill" style={{ width: `${pct}%` }} />
            <span className="poll-check">{mine && <Check size={13} />}</span>
            <span className="poll-text">{o.text}</span>
            <span className="poll-count">{o.userIds.length}{total ? ` · ${pct}%` : ''}</span>
          </button>
        )
      })}
      <div className="poll-hint">{total} {total === 1 ? 'person' : 'people'} voted</div>
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
  const [remindOpen, setRemindOpen] = useState(false)
  const [manage, setManage] = useState(false)
  useStore(s => s.customEmoji) // re-render when the emoji list loads

  const mine = msg.author?.id === me.id
  const run = (p: Promise<unknown>) => p.catch(e => toast((e as Error).message, 'error'))
  const react = (emoji: string) => run(api.react(msg.id, emoji, !msg.reactions.find(r => r.emoji === emoji)?.userIds.includes(me.id)))

  async function saveEdit() {
    const raw = mentionsToRaw(draft, Object.values(users))
    if (raw.trim() === msg.body.trim()) return setEditing(false)
    await run(api.edit(msg.id, raw))
    setEditing(false)
  }

  // Touch screens have no hover, so tapping a message shows its actions instead.
  const [touchOpen, setTouchOpen] = useState(false)
  useEffect(() => {
    if (!touchOpen) return
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.(`[data-id="${msg.id}"]`)) setTouchOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [touchOpen, msg.id])
  const onTap = (e: React.MouseEvent) => {
    if (!window.matchMedia('(hover: none)').matches) return
    if ((e.target as HTMLElement).closest('a, button, input, textarea, img, video, .toolbar')) return
    setTouchOpen(o => !o)
  }

  const cfg = useSettings()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useClickOutside<HTMLDivElement>(() => setMoreOpen(false), moreOpen)
  const moreFit = useKeepInViewport<HTMLDivElement>(moreOpen)
  const [grid, setGrid] = useState(false) // full emoji picker opened from the "more" menu

  // A message made of one to three emoji alone is shown big, like in Teams. Four are shown at normal size.
  const big = cfg.bigEmoji && !msg.subject && !msg.replyTo && msg.attachments.length === 0 && msg.kind === 'text' ? emojiOnlyCount(msg.body) : 0
  const emojiClass = big >= 1 && big <= 3 ? ` emoji e${big}` : ''

  const cls = `msg${mine ? ' mine' : ''}${compact ? ' compact' : ''}${picker || moreOpen || grid ? ' menu-open' : ''}${touchOpen ? ' touch-open' : ''}`

  if (msg.deleted) {
    return (
      <div className={`${cls} deleted`} data-id={msg.id}>
        {!mine && <div className="avatar-slot"><Avatar user={msg.author} size={36} /></div>}
        <div className="msg-col"><div className="bubble">This message was deleted.</div></div>
      </div>
    )
  }

  const pending = msg.id.startsWith('pending-')
  const canReply = !!onQuote || (!inThread && !!onReply)
  const doReply = () => (onQuote ? onQuote(msg) : onReply?.(msg))
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false) => (
    <button className={danger ? 'danger' : ''} onClick={() => { setMoreOpen(false); fn() }}>{icon}{label}</button>
  )

  return (
    <div className={cls + (pending ? ' pending' : '')} data-id={msg.id} onClick={onTap}>
      {manage && <EmojiManager onClose={() => setManage(false)} />}
      {!mine && <div className="avatar-slot"><Avatar user={msg.author} size={36} presence /></div>}
      <div className="msg-col">
        {!compact && (
          <div className="meta">
            {!mine && <span className="author">{msg.author?.name ?? 'Unknown'}</span>}
            <span className="stamp">{formatTime(msg.createdAt)}</span>
            {msg.editedAt && <EditHistory msg={msg} />}
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
          <div className="bubble-wrap">
            <div className={`bubble${msg.pinned ? ' pinned' : ''}${msg.reactions.length ? ' has-reactions' : ''}${emojiClass}`}>
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
              ) : msg.poll ? <PollBlock msg={msg} poll={msg.poll} meId={me.id} />
                : msg.body && <div className="text">{renderBody(msg.body, users, me.id)}</div>}

              {!editing && cfg.linkPreviews && !msg.poll && msg.kind === 'text' && !pending && (() => { const u = firstUrl(msg.body); return u ? <LinkPreview url={u} /> : null })()}

              {msg.attachments.length > 0 && (
                <div className="attachments">
                  {msg.attachments.map(a => /^image\/(png|jpe?g|gif|webp)$/.test(a.mime)
                    ? <img key={a.id} className="attach-img" src={fileUrl(a.id)} alt={a.name} onClick={() => onImage?.(fileUrl(a.id))} />
                    : /^audio\/(webm|ogg|mpeg|wav)/.test(a.mime)
                    ? <audio key={a.id} className="attach-audio" controls preload="none" src={fileUrl(a.id)} aria-label={a.name} />
                    : <a key={a.id} className="attach-file" href={fileUrl(a.id, true)} download={a.name}>
                        <FileText size={20} /><div style={{ minWidth: 0 }}><div className="name">{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{formatBytes(a.size)}</div></div>
                      </a>)}
                </div>
              )}
            </div>

            {msg.reactions.length > 0 && (
              <div className="reactions">
                {msg.reactions.map(r => {
                  const has = r.userIds.includes(me.id)
                  return (
                    <button key={r.emoji} className={`reaction${has ? ' mine' : ''}`} onClick={() => run(api.react(msg.id, r.emoji, !has))}
                      title={r.userIds.map(id => users[id]?.name ?? 'someone').join(', ')}>
                      <span className="emo"><Emoji value={r.emoji} /></span><span className="cnt">{r.userIds.length}</span>
                    </button>
                  )
                })}
                {!pending && (
                  <div style={{ position: 'relative' }}>
                    <button className="reaction add" onClick={() => setPicker(p => !p)} aria-label="Add a reaction" title="Add a reaction"><SmilePlus size={15} /></button>
                    {picker && <ReactionPicker onPick={react} onClose={() => setPicker(false)} align={mine ? 'right' : 'left'} />}
                  </div>
                )}
              </div>
            )}

            {!editing && !pending && (
              <div className="toolbar" role="toolbar" aria-label="Message actions">
                {QUICK_REACTIONS.map(e => <button key={e} className="quick-emoji" onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
                <div ref={moreRef} style={{ position: 'relative' }}>
                  <button className="icon-btn" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}><MoreHorizontal size={16} /></button>
                  {moreOpen && (
                    <div ref={moreFit} className="menu" style={{ top: '100%', [mine ? 'right' : 'left']: 0, marginTop: 4 }} role="menu">
                      {canReply && msg.kind === 'text' && item(<CornerUpLeft size={15} />, 'Reply', doReply)}
                      {item(<Smile size={15} />, 'More reactions', () => setGrid(true))}
                      {mine && msg.kind === 'text' && item(<Pencil size={15} />, 'Edit', () => { setDraft(mentionsToDisplay(msg.body, users)); setEditing(true) })}
                      {item(<AlarmClock size={15} />, 'Remind me…', () => setRemindOpen(true))}
                      {item(saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />, saved ? 'Remove from saved' : 'Save this message', () => void toggleSaved(msg.id))}
                      {!inThread && item(msg.pinned ? <PinOff size={15} /> : <Pin size={15} />, msg.pinned ? 'Unpin' : 'Pin', () => run(api.pin(msg.id, !msg.pinned)))}
                      {(mine || canModerate) && <hr />}
                      {(mine || canModerate) && item(<Trash2 size={15} />, 'Delete', async () => {
                        if (await askConfirm({ title: 'Delete this message?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) void run(api.remove(msg.id))
                      }, true)}
                    </div>
                  )}
                  {grid && <ReactionPicker onPick={react} onClose={() => setGrid(false)} align={mine ? 'right' : 'left'} />}
                  {remindOpen && <RemindMenu msgId={msg.id} onClose={() => setRemindOpen(false)} mine={mine} />}
                </div>
              </div>
            )}
          </div>
        )}

        {!inThread && msg.replyCount > 0 && (
          <button className="thread-link" onClick={() => onReply?.(msg)}>
            <MessageSquareReply size={14} /> {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>
    </div>
  )
}
