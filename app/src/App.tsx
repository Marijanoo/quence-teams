import { useEffect, useState } from 'react'
import { Bell, Calendar as CalendarIcon, MessageSquare, Users, Video, X } from 'lucide-react'
import { api, setUnauthorizedHandler } from './lib/api'
import { restoreSession, useStore } from './lib/store'
import { socket } from './lib/socket'
import type { Meeting, Team, View } from './lib/types'
import { Login } from './components/Login'
import { ActivityFeed, CalendarSidebar, ChatList, TeamsTree } from './components/Sidebar'
import { Conversation, ThreadPanel } from './components/Conversation'
import { Calendar } from './components/Calendar'
import { CallView } from './components/CallView'
import { Search } from './components/Search'
import { Avatar } from './components/ui'
import { ChatMembersDialog, MeetingDialog, NewChannelDialog, NewChatDialog, NewMeetingDialog, NewTeamDialog, ProfileDialog, TeamSettingsDialog } from './components/Dialogs'

type DialogState =
  | { type: 'newChat' } | { type: 'newTeam' } | { type: 'newChannel'; team: Team }
  | { type: 'team'; teamId: string } | { type: 'chatMembers'; chatId: string }
  | { type: 'profile' } | { type: 'newMeeting'; start?: number } | { type: 'meeting'; meeting: Meeting }

const RAIL: { id: View; label: string; icon: typeof Bell }[] = [
  { id: 'activity', label: 'Activity', icon: Bell },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon }
]

export default function App() {
  const me = useStore(s => s.me)
  const ready = useStore(s => s.ready)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(() => useStore.getState().signOut())
    restoreSession().catch(() => {}).finally(() => setBooting(false))
  }, [])

  if (booting) return <div className="login-wrap"><div className="muted">Loading…</div></div>
  if (!me || !ready) return <><Login /><Toasts /></>
  return <Shell />
}

function Shell() {
  const me = useStore(s => s.me)!
  const view = useStore(s => s.view)
  const setView = useStore(s => s.setView)
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const threadId = useStore(s => s.threadId)
  const activeCall = useStore(s => s.activeCall)
  const online = useStore(s => s.online)
  const activityUnseen = useStore(s => s.activityUnseen)
  const chatUnread = useStore(s => s.chats.reduce((n, c) => n + c.unread, 0))
  const teamsUnread = useStore(s => s.teams.reduce((n, t) => n + t.channels.reduce((m, c) => m + c.mentions, 0), 0))
  const toast = useStore(s => s.toast)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  // Upcoming meetings for the sidebar and reminders.
  useEffect(() => {
    api.meetings(Date.now() - 86_400_000, Date.now() + 45 * 86_400_000)
      .then(list => useStore.setState({ meetings: list })).catch(() => {})
  }, [])

  // Ask for desktop notification permission on the first interaction.
  useEffect(() => {
    const ask = () => { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission() }
    window.addEventListener('click', ask, { once: true })
    return () => window.removeEventListener('click', ask)
  }, [])

  // Unread count in the window title.
  useEffect(() => {
    const n = chatUnread + teamsUnread
    document.title = n ? `(${n}) Quence Teams` : 'Quence Teams'
    window.teamsDesktop?.setUnread(n)
  }, [chatUnread, teamsUnread])

  // Meeting reminders five minutes before the start.
  const meetings = useStore(s => s.meetings)
  useEffect(() => {
    const fired = new Set<string>()
    const t = setInterval(() => {
      for (const m of meetings) {
        const until = m.startsAt - Date.now()
        if (until > 0 && until <= 5 * 60_000 && !fired.has(m.id)) {
          fired.add(m.id)
          toast(`“${m.title}” starts in ${Math.max(1, Math.round(until / 60_000))} min`)
        }
      }
    }, 20_000)
    return () => clearInterval(t)
  }, [meetings, toast])

  const showConvo = (view === 'chat' && selection?.kind === 'chat') || (view === 'teams' && selection?.kind === 'channel')
  const badge = (id: View) => id === 'activity' ? activityUnseen : id === 'chat' ? chatUnread : id === 'teams' ? teamsUnread : 0

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-small">
          <div className="brand-mark"><MessageSquare size={15} /></div><span>Quence Teams</span>
        </div>
        <Search />
        <div className="right">
          <button className="btn ghost sm" onClick={() => setDialog({ type: 'profile' })} aria-label="Your profile" style={{ padding: 3 }}>
            <Avatar user={me} size={30} presence />
          </button>
        </div>
      </header>
      {!online && <div className="offline-banner" role="status">Reconnecting…</div>}
      <div className={`body${showConvo ? ' convo-open' : ''}`}>
        <nav className="rail" aria-label="Main">
          {RAIL.map(r => (
            <button key={r.id} className={`rail-btn${view === r.id ? ' active' : ''}`} onClick={() => setView(r.id)} aria-label={r.label} aria-current={view === r.id}>
              <r.icon size={22} />{r.label}
              {badge(r.id) > 0 && <span className="badge">{badge(r.id) > 99 ? '99+' : badge(r.id)}</span>}
            </button>
          ))}
        </nav>

        <aside className="sidebar">
          {view === 'activity' && <ActivityFeed />}
          {view === 'chat' && <ChatList onNewChat={() => setDialog({ type: 'newChat' })} />}
          {view === 'teams' && <TeamsTree onNewTeam={() => setDialog({ type: 'newTeam' })} onNewChannel={team => setDialog({ type: 'newChannel', team })} onManage={team => setDialog({ type: 'team', teamId: team.id })} />}
          {view === 'calendar' && <CalendarSidebar onNew={() => setDialog({ type: 'newMeeting' })} onOpen={meeting => setDialog({ type: 'meeting', meeting })} />}
        </aside>

        {view === 'calendar'
          ? <Calendar onNew={start => setDialog({ type: 'newMeeting', start })} onOpen={meeting => setDialog({ type: 'meeting', meeting })} />
          : showConvo
            ? <Conversation key={selection!.convoId} onBack={() => select(null)} onTeamSettings={teamId => setDialog({ type: 'team', teamId })} onChatMembers={chatId => setDialog({ type: 'chatMembers', chatId })} />
            : <div className="main"><div className="empty" style={{ margin: 'auto' }}>
                <MessageSquare size={44} color="var(--accent)" />
                <h3>{view === 'activity' ? 'Pick something from your feed' : view === 'chat' ? 'Select a chat' : 'Select a channel'}</h3>
                <div>Messages, files and meetings live here.</div>
              </div></div>}

        {threadId && showConvo && <ThreadPanel key={threadId} />}
      </div>

      {dialog?.type === 'newChat' && <NewChatDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'newTeam' && <NewTeamDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'newChannel' && <NewChannelDialog team={dialog.team} onClose={() => setDialog(null)} />}
      {dialog?.type === 'team' && <TeamSettingsDialog teamId={dialog.teamId} onClose={() => setDialog(null)} />}
      {dialog?.type === 'chatMembers' && <ChatMembersDialog chatId={dialog.chatId} onClose={() => setDialog(null)} />}
      {dialog?.type === 'profile' && <ProfileDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'newMeeting' && <NewMeetingDialog initialStart={dialog.start} onClose={() => setDialog(null)} />}
      {dialog?.type === 'meeting' && <MeetingDialog meeting={dialog.meeting} onClose={() => setDialog(null)} />}

      {activeCall && <CallView key={activeCall.room} />}
      <IncomingCall />
      <Toasts />
    </div>
  )
}

function IncomingCall() {
  const incoming = useStore(s => s.incoming)
  const joinCall = useStore(s => s.joinCall)
  const dismiss = useStore(s => s.dismissIncoming)
  const activeCall = useStore(s => s.activeCall)
  const users = useStore(s => s.users)

  // Stop ringing after a while, or once somebody else answered and the call is over.
  useEffect(() => {
    if (!incoming) return
    const t = setTimeout(dismiss, 45_000)
    return () => clearTimeout(t)
  }, [incoming, dismiss])

  if (!incoming || activeCall) return null
  const from = users[incoming.from.id] ?? incoming.from
  return (
    <div className="incoming" role="alertdialog" aria-label="Incoming call">
      <Avatar user={from} size={44} />
      <div><div style={{ fontWeight: 700 }}>{from.name}</div><div className="muted">is calling you</div></div>
      <button className="btn primary" onClick={() => joinCall(incoming.room, from.name)}><Video size={15} /> Answer</button>
      <button className="btn danger" onClick={() => { socket.send('call.decline', { convoId: incoming.convoId }); dismiss() }}>Decline</button>
    </div>
  )
}

function Toasts() {
  const toasts = useStore(s => s.toasts)
  const dismiss = useStore(s => s.dismissToast)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind ?? ''}`} role={t.kind === 'error' ? 'alert' : 'status'} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{t.text}</span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  )
}
