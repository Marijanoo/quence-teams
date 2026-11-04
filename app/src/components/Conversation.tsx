import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, FileText, Hash, Lock, Phone, Settings, Users, Video } from 'lucide-react'
import { api, fileUrl } from '../lib/api'
import { formatBytes, formatDay, formatShort, sameDay } from '../lib/format'
import { chatTitle, useStore } from '../lib/store'
import { socket } from '../lib/socket'
import type { Message, TeamDetail, User } from '../lib/types'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'
import { GroupAvatar, MenuButton } from './ui'

type Tab = 'posts' | 'files' | 'pins'

export function Conversation({ onBack, onTeamSettings, onChatMembers }: { onBack: () => void; onTeamSettings: (teamId: string) => void; onChatMembers: (chatId: string) => void }) {
  const selection = useStore(s => s.selection)!
  const me = useStore(s => s.me)!
  const teams = useStore(s => s.teams)
  const chats = useStore(s => s.chats)
  const cache = useStore(s => s.convos[selection.convoId])
  const typingMap = useStore(s => s.typing[selection.convoId])
  const users = useStore(s => s.users)
  const openThread = useStore(s => s.openThread)
  const loadMore = useStore(s => s.loadMore)
  const joinCall = useStore(s => s.joinCall)
  const toast = useStore(s => s.toast)
  const callParticipants = useStore(s => s.calls[selection.convoId])

  const [tab, setTab] = useState<Tab>('posts')
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)

  const team = selection.kind === 'channel' ? teams.find(t => t.id === selection.teamId) : undefined
  const channel = team?.channels.find(c => c.id === selection.convoId)
  const chat = selection.kind === 'chat' ? chats.find(c => c.id === selection.convoId) : undefined

  useEffect(() => { setTab('posts') }, [selection.convoId])

  useEffect(() => {
    setTeamDetail(null)
    if (selection.kind !== 'channel' || !selection.teamId) return
    let alive = true
    api.team(selection.teamId).then(t => { if (alive) setTeamDetail(t) }).catch(() => {})
    return () => { alive = false }
  }, [selection.kind, selection.teamId, teams])

  const members: User[] = useMemo(() => {
    if (chat) return chat.members
    return teamDetail?.members ?? []
  }, [chat, teamDetail])

  const title = chat ? chatTitle(chat, me.id) : channel?.name ?? ''
  const isOwner = team?.role === 'owner'
  const messages = cache?.messages ?? []

  // ----- scrolling -----
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prev = useRef<{ first?: string; last?: string; height: number; convo: string }>({ height: 0, convo: '' })

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const first = messages[0]?.id, last = messages[messages.length - 1]?.id
    const p = prev.current
    if (p.convo !== selection.convoId) el.scrollTop = el.scrollHeight
    else if (first !== p.first && last === p.last) el.scrollTop = el.scrollHeight - p.height + el.scrollTop // older page prepended
    else if (stick.current || messages[messages.length - 1]?.author?.id === me.id) el.scrollTop = el.scrollHeight
    prev.current = { first, last, height: el.scrollHeight, convo: selection.convoId }
  }, [messages, selection.convoId, me.id, tab])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    prev.current.height = el.scrollHeight
    if (el.scrollTop < 60 && cache?.hasMore) void loadMore(selection.convoId)
  }

  // Jump to a specific message (from search / activity).
  const jump = useStore(s => s.jumpTo)
  useEffect(() => {
    if (!jump) return
    const el = scroller.current?.querySelector(`[data-id="${jump}"]`)
    if (el) { el.scrollIntoView({ block: 'center' }); setHighlight(jump); setTimeout(() => setHighlight(null), 1600) }
  }, [jump, messages.length])

  const typingNames = Object.keys(typingMap ?? {}).filter(id => id !== me.id).map(id => users[id]?.name ?? 'Someone')
  const typingText = typingNames.length === 0 ? '' : typingNames.length === 1 ? `${typingNames[0]} is typing…` : typingNames.length === 2 ? `${typingNames.join(' and ')} are typing…` : 'Several people are typing…'

  const startMeeting = useCallback(async () => {
    try {
      if (selection.kind === 'channel') await api.meetNow(selection.convoId)
      else socket.send('call.ring', { convoId: selection.convoId })
      joinCall(selection.convoId, title)
    } catch (e) { toast((e as Error).message, 'error') }
  }, [selection, joinCall, title, toast])

  const [pins, setPins] = useState<Message[]>([])
  const [files, setFiles] = useState<Awaited<ReturnType<typeof api.files>>>([])
  useEffect(() => {
    if (tab === 'pins') api.pins(selection.convoId).then(setPins).catch(e => toast(e.message, 'error'))
    if (tab === 'files') api.files(selection.convoId).then(setFiles).catch(e => toast(e.message, 'error'))
  }, [tab, selection.convoId, toast, messages.length])

  const inCall = callParticipants?.length

  return (
    <div className="main" style={{ position: 'relative' }}>
      <div className="convo-head">
        <div className="head-row">
          <button className="icon-btn back-btn" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button>
          {chat ? <GroupAvatar users={chat.members.filter(m => m.id !== me.id)} size={32} /> : null}
          <h2>
            {channel && (channel.isPrivate ? <Lock size={16} /> : <Hash size={16} />)}
            <span className="t">{title}</span>
          </h2>
          {channel?.description && <span className="muted" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.description}</span>}
          <div className="grow" />
          {inCall ? <span className="badge" style={{ background: 'var(--success)', color: 'oklch(0.2 0.02 160)' }}>● {inCall} in call</span> : null}
          <button className="btn sm" onClick={startMeeting} title={selection.kind === 'channel' ? 'Start a meeting in this channel' : 'Start a call'}>
            {selection.kind === 'channel' ? <Video size={15} /> : <Phone size={15} />}{inCall ? 'Join' : selection.kind === 'channel' ? 'Meet' : 'Call'}
          </button>
          {chat?.type === 'group' && <button className="icon-btn" title="People" onClick={() => onChatMembers(chat.id)}><Users size={17} /></button>}
          {team && (
            <MenuButton button={<button className="icon-btn" aria-label="Channel options"><Settings size={17} /></button>}
              items={[
                { label: 'Manage team', icon: <Users size={15} />, onClick: () => onTeamSettings(team.id) },
                { label: 'Delete channel', danger: true, hidden: !isOwner || team.channels[0]?.id === channel?.id,
                  onClick: async () => { if (channel && confirm(`Delete #${channel.name} and all its messages?`)) await api.deleteChannel(channel.id).catch(e => toast(e.message, 'error')) } }
              ]} />
          )}
        </div>
        <div className="tabs" role="tablist">
          {(['posts', 'files', 'pins'] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'posts' ? (selection.kind === 'channel' ? 'Posts' : 'Chat') : t === 'files' ? 'Files' : 'Pinned'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'posts' && (
        <>
          <div className="messages" ref={scroller} onScroll={onScroll}>
            {cache?.hasMore && <div className="empty" style={{ padding: 8 }}><button className="btn sm ghost" onClick={() => loadMore(selection.convoId)}>Load older messages</button></div>}
            {!cache?.loaded && <div className="empty">Loading…</div>}
            {cache?.loaded && messages.length === 0 && (
              <div className="empty">
                <h3>{selection.kind === 'channel' ? `Welcome to #${title}` : 'Say hello'}</h3>
                <div>{selection.kind === 'channel' ? 'Be the first to post in this channel.' : 'This is the start of your conversation.'}</div>
              </div>
            )}
            {messages.map((m, i) => {
              const before = messages[i - 1]
              const newDay = !before || !sameDay(before.createdAt, m.createdAt)
              const compact = !newDay && !!before && before.author?.id === m.author?.id && before.kind === 'text' && m.kind === 'text'
                && !m.subject && m.createdAt - before.createdAt < 5 * 60_000 && !before.deleted
              return (
                <div key={m.id} className={highlight === m.id ? 'highlight' : ''}>
                  {newDay && <div className="day-divider">{formatDay(m.createdAt)}</div>}
                  <MessageItem msg={m} compact={compact} canModerate={isOwner} onReply={msg => openThread(msg.id)} onImage={setLightbox} />
                </div>
              )
            })}
          </div>
          <div className="typing" aria-live="polite">{typingText}</div>
          <Composer convoId={selection.convoId} placeholder={selection.kind === 'channel' ? `Start a new post in #${title}` : 'Type a message'}
            allowSubject={selection.kind === 'channel'} members={members} />
        </>
      )}

      {tab === 'files' && (
        <div className="file-list">
          {files.map(f => (
            <a key={f.id} className="file-row" href={fileUrl(f.id, true)} download={f.name}>
              <FileText size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{f.uploader.name} · {formatShort(f.createdAt)}</div>
              </div>
              <span className="muted">{formatBytes(f.size)}</span>
            </a>
          ))}
          {!files.length && <div className="empty"><h3>No files yet</h3><div>Files shared here show up in this list.</div></div>}
        </div>
      )}

      {tab === 'pins' && (
        <div className="file-list">
          {pins.map(m => <MessageItem key={m.id} msg={m} inThread canModerate={isOwner} onImage={setLightbox} />)}
          {!pins.length && <div className="empty"><h3>Nothing pinned</h3><div>Pin an important message from its hover toolbar.</div></div>}
        </div>
      )}

      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>}
    </div>
  )
}

export function ThreadPanel() {
  const threadId = useStore(s => s.threadId)!
  const selection = useStore(s => s.selection)!
  const root = useStore(s => s.convos[selection.convoId]?.messages.find(m => m.id === threadId))
  const replies = useStore(s => s.threads[threadId]) ?? []
  const openThread = useStore(s => s.openThread)
  const teams = useStore(s => s.teams)
  const chats = useStore(s => s.chats)
  const me = useStore(s => s.me)!
  const [members, setMembers] = useState<User[]>([])
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selection.kind === 'chat') setMembers(chats.find(c => c.id === selection.convoId)?.members ?? [])
    else if (selection.teamId) api.team(selection.teamId).then(t => setMembers(t.members)).catch(() => {})
  }, [selection, chats, teams])

  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight }, [replies.length, threadId])

  if (!root) return null
  const isOwner = teams.find(t => t.id === selection.teamId)?.role === 'owner'
  return (
    <aside className="thread-panel" aria-label="Thread">
      <div className="thread-head">
        <span>Thread</span>
        <button className="btn sm ghost" onClick={() => openThread(null)}>Close</button>
      </div>
      <div className="messages" ref={scroller}>
        <div className="thread-root"><MessageItem msg={root} inThread canModerate={isOwner} /></div>
        {replies.map((m, i) => {
          const before = replies[i - 1]
          const compact = !!before && before.author?.id === m.author?.id && m.createdAt - before.createdAt < 5 * 60_000 && !before.deleted
          return <MessageItem key={m.id} msg={m} inThread compact={compact} canModerate={isOwner} />
        })}
      </div>
      <Composer convoId={selection.convoId} parentId={root.id} placeholder={`Reply to ${root.author?.id === me.id ? 'yourself' : root.author?.name ?? 'thread'}`} members={members} />
    </aside>
  )
}

