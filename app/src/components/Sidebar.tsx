import { useEffect, useState } from 'react'
import { AtSign, Bookmark, CalendarClock, ChevronDown, ChevronRight, Hash, Lock, MessageSquareReply, Pencil, Plus, SmilePlus, Star, Users, Video } from 'lucide-react'
import { api } from '../lib/api'
import { formatShort, plainText } from '../lib/format'
import { chatTitle, useStore } from '../lib/store'
import type { ActivityItem, Chat, Meeting, Team } from '../lib/types'
import { Avatar, GroupAvatar, MenuButton } from './ui'

function useSectionState() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('qt.collapsed') ?? '{}') } catch { return {} }
  })
  useEffect(() => { try { localStorage.setItem('qt.collapsed', JSON.stringify(collapsed)) } catch { /* ignore */ } }, [collapsed])
  return [collapsed, (k: string) => setCollapsed(c => ({ ...c, [k]: !c[k] }))] as const
}

function SectionHeader({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className="nav-section">
      <button className="nav-section-btn" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{label}</span>
      </button>
      <div className="nav-section-actions">{children}</div>
    </div>
  )
}

// A row that can hold its own buttons (a <button> may not contain another <button>).
function NavRow({ active, unread, onClick, className, children }: { active?: boolean; unread?: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} className={`row${active ? ' active' : ''}${unread ? ' unread' : ''}${className ? ' ' + className : ''}`}
      onClick={onClick} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}>
      {children}
    </div>
  )
}

function StarButton({ convoId }: { convoId: string }) {
  const fav = useStore(s => s.favorites.includes(convoId))
  const toggle = useStore(s => s.toggleFavorite)
  return (
    <button className={`icon-btn star${fav ? ' on' : ''}`} style={{ width: 24, height: 24 }} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={fav}
      title={fav ? 'Remove from favorites' : 'Add to favorites'} onClick={e => { e.stopPropagation(); void toggle(convoId) }}>
      <Star size={14} fill={fav ? 'currentColor' : 'none'} />
    </button>
  )
}

// The single navigation under "Chat": quick views, favorites, chats, then teams and their channels.
export function ChatNav({ onNewChat, onNewTeam, onNewChannel, onManage }: {
  onNewChat: () => void; onNewTeam: () => void; onNewChannel: (t: Team) => void; onManage: (t: Team) => void
}) {
  const chats = useStore(s => s.chats)
  const teams = useStore(s => s.teams)
  const me = useStore(s => s.me)!
  const users = useStore(s => s.users)
  const favorites = useStore(s => s.favorites)
  const drafts = useStore(s => s.drafts)
  const quickView = useStore(s => s.quickView)
  const setQuick = useStore(s => s.setQuick)
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const calls = useStore(s => s.calls)
  const [collapsed, toggle] = useSectionState()

  const mentionCount = chats.reduce((n, c) => n + c.mentions, 0) + teams.reduce((n, t) => n + t.channels.reduce((m, c) => m + c.mentions, 0), 0)
  const draftCount = Object.keys(drafts).filter(k => !k.includes('#')).length

  const favChats = favorites.map(id => chats.find(c => c.id === id)).filter((c): c is Chat => !!c)
  const favChannels = favorites.flatMap(id => teams.flatMap(t => t.channels.filter(c => c.id === id).map(c => ({ team: t, channel: c }))))
  const otherChats = chats.filter(c => !favorites.includes(c.id))

  const chatRow = (c: Chat) => {
    const others = c.members.filter(m => m.id !== me.id)
    const last = c.lastMessage
    const lastBy = last?.authorId === me.id ? 'You: ' : c.type === 'group' && last?.authorId ? `${users[last.authorId]?.name.split(' ')[0] ?? ''}: ` : ''
    return (
      <NavRow key={c.id} active={selection?.convoId === c.id && !quickView} unread={c.unread > 0} onClick={() => select({ convoId: c.id, kind: 'chat' })}>
        <GroupAvatar users={others.length ? others : [me]} size={36} />
        <div className="grow">
          <div className="title">{chatTitle(c, me.id)}</div>
          <div className="preview">{calls[c.id]?.length ? '📞 Call in progress' : last ? `${lastBy}${last.kind === 'call' ? 'Started a meeting' : plainText(last.body, users) || 'Sent a file'}` : 'No messages yet'}</div>
        </div>
        <StarButton convoId={c.id} />
        <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
          {last && <span className="time">{formatShort(last.createdAt)}</span>}
          {c.unread > 0 && <span className="badge" style={c.mentions ? undefined : { background: 'var(--accent)', color: 'var(--accent-fg)' }}>{c.unread > 99 ? '99+' : c.unread}</span>}
        </div>
      </NavRow>
    )
  }

  const channelRow = (t: Team, c: Team['channels'][number], showTeam = false) => (
    <NavRow key={(showTeam ? 'fav-' : '') + c.id} className="channel-row" active={selection?.convoId === c.id && !quickView} unread={c.unread > 0}
      onClick={() => select({ convoId: c.id, kind: 'channel', teamId: t.id })}>
      {c.isPrivate ? <Lock size={14} /> : <Hash size={14} />}
      <div className="grow">
        <div className="title">{c.name}</div>
        {showTeam && <div className="preview">{t.name}</div>}
      </div>
      {calls[c.id]?.length ? <Video size={14} color="var(--success)" /> : null}
      <StarButton convoId={c.id} />
      {c.mentions > 0 ? <span className="badge">@{c.mentions}</span> : c.unread > 0 ? <span className="dot" /> : null}
    </NavRow>
  )

  const quick = (id: 'mentions' | 'drafts' | 'saved' | 'scheduled', label: string, icon: React.ReactNode, count: number) => (
    <NavRow key={id} active={quickView === id} unread={id === 'mentions' && count > 0} onClick={() => setQuick(quickView === id ? null : id)}>
      <span className="quick-ico">{icon}</span>
      <div className="grow title">{label}</div>
      {count > 0 && <span className={id === 'mentions' ? 'badge' : 'count'}>{count}</span>}
    </NavRow>
  )

  return (
    <>
      <div className="sidebar-head">
        <h2>Chat</h2>
        <button className="icon-btn" onClick={onNewChat} title="New chat" aria-label="New chat"><Plus size={18} /></button>
      </div>
      <div className="sidebar-scroll">
        <SectionHeader label="Quick views" open={!collapsed.quick} onToggle={() => toggle('quick')} />
        {!collapsed.quick && (
          <>
            {quick('mentions', 'Mentions', <AtSign size={17} />, mentionCount)}
            {quick('drafts', 'Drafts', <Pencil size={16} />, draftCount)}
            {quick('saved', 'Saved', <Bookmark size={16} />, 0)}
            {quick('scheduled', 'Scheduled', <CalendarClock size={16} />, 0)}
          </>
        )}

        {(favChats.length > 0 || favChannels.length > 0) && (
          <>
            <SectionHeader label="Favorites" open={!collapsed.favorites} onToggle={() => toggle('favorites')} />
            {!collapsed.favorites && (
              <>
                {favChats.map(chatRow)}
                {favChannels.map(({ team, channel }) => channelRow(team, channel, true))}
              </>
            )}
          </>
        )}

        <SectionHeader label="Chats" open={!collapsed.chats} onToggle={() => toggle('chats')}>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={onNewChat} aria-label="Start a chat" title="Start a chat"><Plus size={15} /></button>
        </SectionHeader>
        {!collapsed.chats && (
          <>
            {otherChats.map(chatRow)}
            {!chats.length && (
              <div className="empty" style={{ padding: '14px 12px' }}>
                <div>No chats yet.</div>
                <button className="btn primary sm" onClick={onNewChat}>New chat</button>
              </div>
            )}
          </>
        )}

        <SectionHeader label="Teams and channels" open={!collapsed.teams} onToggle={() => toggle('teams')}>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={onNewTeam} aria-label="Create a team" title="Create a team"><Plus size={15} /></button>
        </SectionHeader>
        {!collapsed.teams && (
          <>
            {teams.map(t => {
              const closed = collapsed['team:' + t.id]
              const teamUnread = t.channels.reduce((n, c) => n + c.unread, 0)
              return (
                <div key={t.id}>
                  <div className="row team-head" style={{ cursor: 'default' }}>
                    <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label={closed ? `Expand ${t.name}` : `Collapse ${t.name}`} aria-expanded={!closed}
                      onClick={() => toggle('team:' + t.id)}>
                      {closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <div className="team-avatar">{t.name.slice(0, 1).toUpperCase()}</div>
                    <div className="grow title" style={{ fontWeight: teamUnread ? 700 : 600 }}>{t.name}</div>
                    {closed && teamUnread > 0 && <span className="dot" />}
                    <MenuButton button={<button className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`${t.name} options`}>⋯</button>}
                      items={[
                        { label: 'Add channel', icon: <Plus size={15} />, onClick: () => onNewChannel(t) },
                        { label: 'Manage team', icon: <Users size={15} />, onClick: () => onManage(t) }
                      ]} />
                  </div>
                  {!closed && t.channels.map(c => channelRow(t, c))}
                </div>
              )
            })}
            {!teams.length && (
              <div className="empty" style={{ padding: '14px 12px' }}>
                <div>You are not in any team yet.</div>
                <button className="btn primary sm" onClick={onNewTeam}>Create a team</button>
              </div>
            )}
          </>
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
          <button key={m.occId ?? m.id} className="row" onClick={() => onOpen(m)}>
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
