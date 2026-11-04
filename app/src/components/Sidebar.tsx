import { useEffect, useState } from 'react'
import { AtSign, ChevronDown, ChevronRight, Hash, Lock, MessageSquareReply, Plus, SmilePlus, Users, Video } from 'lucide-react'
import { api } from '../lib/api'
import { formatShort, plainText } from '../lib/format'
import { chatTitle, useStore } from '../lib/store'
import type { ActivityItem, Meeting, Team } from '../lib/types'
import { Avatar, GroupAvatar, MenuButton } from './ui'

export function ChatList({ onNewChat }: { onNewChat: () => void }) {
  const chats = useStore(s => s.chats)
  const me = useStore(s => s.me)!
  const users = useStore(s => s.users)
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const calls = useStore(s => s.calls)

  return (
    <>
      <div className="sidebar-head">
        <h2>Chat</h2>
        <button className="icon-btn" onClick={onNewChat} title="New chat" aria-label="New chat"><Plus size={18} /></button>
      </div>
      <div className="sidebar-scroll">
        {chats.map(c => {
          const others = c.members.filter(m => m.id !== me.id)
          const last = c.lastMessage
          const lastBy = last?.authorId === me.id ? 'You: ' : c.type === 'group' && last?.authorId ? `${users[last.authorId]?.name.split(' ')[0] ?? ''}: ` : ''
          const active = selection?.convoId === c.id
          return (
            <button key={c.id} className={`row${active ? ' active' : ''}${c.unread ? ' unread' : ''}`} onClick={() => select({ convoId: c.id, kind: 'chat' })}>
              <GroupAvatar users={others.length ? others : [me]} size={36} />
              <div className="grow">
                <div className="title">{chatTitle(c, me.id)}</div>
                <div className="preview">{calls[c.id]?.length ? '📞 Call in progress' : last ? `${lastBy}${last.kind === 'call' ? 'Started a meeting' : plainText(last.body, users) || 'Sent a file'}` : 'No messages yet'}</div>
              </div>
              <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                {last && <span className="time">{formatShort(last.createdAt)}</span>}
                {c.unread > 0 && <span className="badge" style={c.mentions ? undefined : { background: 'var(--accent)', color: 'var(--accent-fg)' }}>{c.unread > 99 ? '99+' : c.unread}</span>}
              </div>
            </button>
          )
        })}
        {!chats.length && (
          <div className="empty">
            <h3>No chats yet</h3>
            <div>Start a conversation with a teammate.</div>
            <button className="btn primary" onClick={onNewChat}>New chat</button>
          </div>
        )}
      </div>
    </>
  )
}

export function TeamsTree({ onNewTeam, onNewChannel, onManage }: { onNewTeam: () => void; onNewChannel: (t: Team) => void; onManage: (t: Team) => void }) {
  const teams = useStore(s => s.teams)
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const calls = useStore(s => s.calls)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('qt.collapsed') ?? '{}') } catch { return {} }
  })
  useEffect(() => { try { localStorage.setItem('qt.collapsed', JSON.stringify(collapsed)) } catch { /* ignore */ } }, [collapsed])

  return (
    <>
      <div className="sidebar-head">
        <h2>Teams</h2>
        <button className="icon-btn" onClick={onNewTeam} title="Create a team" aria-label="Create a team"><Plus size={18} /></button>
      </div>
      <div className="sidebar-scroll">
        {teams.map(t => {
          const isCollapsed = collapsed[t.id]
          const teamUnread = t.channels.reduce((n, c) => n + c.unread, 0)
          return (
            <div key={t.id}>
              <div className="row team-head" style={{ cursor: 'default' }}>
                <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label={isCollapsed ? 'Expand' : 'Collapse'} aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed(c => ({ ...c, [t.id]: !c[t.id] }))}>
                  {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
                <div className="team-avatar">{t.name.slice(0, 1).toUpperCase()}</div>
                <div className="grow title" style={{ fontWeight: teamUnread ? 700 : 600 }}>{t.name}</div>
                {isCollapsed && teamUnread > 0 && <span className="dot" />}
                <MenuButton button={<button className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`${t.name} options`}>⋯</button>}
                  items={[
                    { label: 'Add channel', icon: <Plus size={15} />, onClick: () => onNewChannel(t) },
                    { label: 'Manage team', icon: <Users size={15} />, onClick: () => onManage(t) }
                  ]} />
              </div>
              {!isCollapsed && t.channels.map(c => {
                const active = selection?.convoId === c.id
                return (
                  <button key={c.id} className={`row channel-row${active ? ' active' : ''}${c.unread ? ' unread' : ''}`}
                    onClick={() => select({ convoId: c.id, kind: 'channel', teamId: t.id })}>
                    {c.isPrivate ? <Lock size={14} /> : <Hash size={14} />}
                    <div className="grow title">{c.name}</div>
                    {calls[c.id]?.length ? <Video size={14} color="var(--success)" /> : null}
                    {c.mentions > 0 ? <span className="badge">@{c.mentions}</span> : c.unread > 0 ? <span className="dot" /> : null}
                  </button>
                )
              })}
            </div>
          )
        })}
        {!teams.length && (
          <div className="empty">
            <h3>You are not in any team</h3>
            <div>Create a team to organise channels and conversations with your group.</div>
            <button className="btn primary" onClick={onNewTeam}>Create a team</button>
          </div>
        )}
      </div>
    </>
  )
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const users = useStore(s => s.users)
  const goTo = useStore(s => s.goTo)
  const toast = useStore(s => s.toast)

  useEffect(() => {
    api.activity().then(setItems).catch(e => toast(e.message, 'error'))
    api.activitySeen().then(() => useStore.setState({ activityUnseen: 0 })).catch(() => {})
  }, [toast])

  const label = (a: ActivityItem) => a.type === 'mention' ? 'mentioned you' : a.type === 'reply' ? 'replied to your post' : `reacted ${a.emoji} to your message`
  const icon = (a: ActivityItem) => a.type === 'mention' ? <AtSign size={13} /> : a.type === 'reply' ? <MessageSquareReply size={13} /> : <SmilePlus size={13} />

  return (
    <>
      <div className="sidebar-head"><h2>Activity</h2></div>
      <div className="sidebar-scroll">
        {items?.map((a, i) => (
          <button key={i} className={`row${a.unseen ? ' unread' : ''}`} style={{ alignItems: 'flex-start' }}
            onClick={() => goTo(a.message.convoId, a.message.id, a.message.parentId ?? (a.type === 'reply' ? a.message.id : undefined))}>
            <Avatar user={a.actor} size={34} />
            <div className="grow">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: a.unseen ? 700 : 500 }}>{icon(a)}<span className="title">{a.actor?.name ?? 'Someone'} {label(a)}</span></div>
              <div className="preview">{plainText(a.message.body, users) || 'Attachment'}</div>
            </div>
            <span className="time">{formatShort(a.message.createdAt)}</span>
          </button>
        ))}
        {items && !items.length && <div className="empty"><h3>All caught up</h3><div>Mentions, replies and reactions show up here.</div></div>}
        {!items && <div className="empty">Loading…</div>}
      </div>
    </>
  )
}

export function CalendarSidebar({ onNew, onOpen }: { onNew: () => void; onOpen: (m: Meeting) => void }) {
  const meetings = useStore(s => s.meetings)
  const upcoming = meetings.filter(m => m.endsAt > Date.now()).slice(0, 30)
  return (
    <>
      <div className="sidebar-head">
        <h2>Calendar</h2>
        <button className="icon-btn" onClick={onNew} title="New meeting" aria-label="New meeting"><Plus size={18} /></button>
      </div>
      <div className="sidebar-scroll">
        <div className="section-label">Upcoming</div>
        {upcoming.map(m => (
          <button key={m.id} className="row" onClick={() => onOpen(m)}>
            <Video size={16} />
            <div className="grow">
              <div className="title">{m.title}</div>
              <div className="preview">{new Date(m.startsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}</div>
            </div>
          </button>
        ))}
        {!upcoming.length && <div className="empty"><h3>No upcoming meetings</h3><button className="btn primary" onClick={onNew}>Schedule a meeting</button></div>}
      </div>
    </>
  )
}
