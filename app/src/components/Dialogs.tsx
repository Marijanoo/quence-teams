import { useEffect, useState } from 'react'
import { Crown, LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { askConfirm, chatTitle, useStore } from '../lib/store'
import type { Meeting, Team, TeamDetail } from '../lib/types'
import { Avatar, Dialog, PeoplePicker, presenceLabel } from './ui'
import { formatTime } from '../lib/format'

export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const select = useStore(s => s.select)
  const toast = useStore(s => s.toast)

  async function create() {
    setBusy(true)
    try {
      const chat = await api.createChat(picked, title)
      useStore.setState(s => ({ chats: s.chats.some(c => c.id === chat.id) ? s.chats : [chat, ...s.chats], view: 'chat' }))
      await select({ convoId: chat.id, kind: 'chat' })
      onClose()
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title="New chat" onClose={onClose}>
      <PeoplePicker selected={picked} onChange={setPicked} />
      {picked.length > 1 && (
        <label className="field">Group name (optional)
          <input className="input" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
        </label>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!picked.length || busy} onClick={create}>{picked.length > 1 ? 'Create group' : 'Start chat'}</button>
      </div>
    </Dialog>
  )
}

export function NewTeamDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useStore(s => s.toast)
  const select = useStore(s => s.select)

  async function create() {
    setBusy(true)
    try {
      const team = await api.createTeam(name, description)
      useStore.setState(s => ({ teams: [...s.teams, team], view: 'chat', quickView: null }))
      await select({ convoId: team.channels[0].id, kind: 'channel', teamId: team.id })
      onClose()
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title="Create a team" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) void create() }} style={{ display: 'grid', gap: 14 }}>
        <label className="field">Team name
          <input className="input" value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">Description (optional)
          <input className="input" value={description} maxLength={300} onChange={e => setDescription(e.target.value)} />
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || busy}>Create</button>
        </div>
      </form>
    </Dialog>
  )
}

export function NewChannelDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useStore(s => s.toast)
  const select = useStore(s => s.select)

  async function create() {
    setBusy(true)
    try {
      const c = await api.createChannel(team.id, name, isPrivate, description)
      useStore.setState(s => ({ teams: s.teams.map(t => t.id === team.id ? { ...t, channels: [...t.channels, c] } : t), view: 'chat', quickView: null }))
      await select({ convoId: c.id, kind: 'channel', teamId: team.id })
      onClose()
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title={`New channel in ${team.name}`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) void create() }} style={{ display: 'grid', gap: 14 }}>
        <label className="field">Channel name
          <input className="input" value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">Description (optional)
          <input className="input" value={description} maxLength={300} onChange={e => setDescription(e.target.value)} />
        </label>
        <label className="check"><input type="checkbox" checked={isPrivate} onChange={e => setPrivate(e.target.checked)} /> Private channel (only people you add can see it)</label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || busy}>Create</button>
        </div>
      </form>
    </Dialog>
  )
}

export function TeamSettingsDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const me = useStore(s => s.me)!
  const teams = useStore(s => s.teams)
  const toast = useStore(s => s.toast)
  const [detail, setDetail] = useState<TeamDetail | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.team(teamId).then(setDetail).catch(e => { toast(e.message, 'error'); onClose() })
  useEffect(() => { void load() }, [teamId, teams]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return <Dialog title="Team" onClose={onClose}><div className="empty">Loading…</div></Dialog>
  const owner = detail.role === 'owner'
  const act = async (fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(true)
    try { await fn(); await load(); done?.() } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }

  return (
    <Dialog title={detail.name} onClose={onClose} wide>
      {detail.description && <div className="muted">{detail.description}</div>}
      <div className="section-label" style={{ padding: 0 }}>Members ({detail.members.length})</div>
      <div className="pick-list" style={{ maxHeight: 280 }}>
        {detail.members.map(m => (
          <div key={m.id} className="pick-row" style={{ cursor: 'default' }}>
            <Avatar user={m} size={30} presence />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>{m.name} {m.id === me.id && <span className="muted">(you)</span>}</div>
              <div className="muted" style={{ fontSize: 12 }}>{m.email}</div>
            </div>
            {m.role === 'owner' && <span className="chip" style={{ padding: '2px 8px' }}><Crown size={12} /> Owner</span>}
            {owner && m.id !== me.id && (
              <>
                <button className="btn sm ghost" disabled={busy} onClick={() => act(() => api.setTeamRole(teamId, m.id, m.role === 'owner' ? 'member' : 'owner'))}>
                  {m.role === 'owner' ? 'Make member' : 'Make owner'}
                </button>
                <button className="icon-btn" title="Remove from team" disabled={busy} onClick={async () => { if (await askConfirm({ title: `Remove ${m.name}?`, message: `${m.name} will lose access to ${detail.name} and its channels.`, confirmLabel: 'Remove', danger: true })) void act(() => api.removeTeamMember(teamId, m.id)) }}><UserMinus size={16} /></button>
              </>
            )}
          </div>
        ))}
      </div>
      {owner && (
        <form onSubmit={e => { e.preventDefault(); if (email.trim()) void act(() => api.addTeamMember(teamId, email.trim()), () => setEmail('')) }} style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="email" placeholder="Add someone by email" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn primary" disabled={busy || !email.trim()}><UserPlus size={15} /> Add</button>
        </form>
      )}
      <div className="muted" style={{ fontSize: 12 }}>People must have signed in to Quence Teams at least once before you can add them.</div>
      <div className="actions split">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn danger" onClick={async () => { if (await askConfirm({ title: `Leave ${detail.name}?`, message: 'You will need to be added again to rejoin.', confirmLabel: 'Leave', danger: true })) void act(() => api.removeTeamMember(teamId, me.id), onClose) }}><LogOut size={15} /> Leave</button>
          {owner && <button className="btn danger" onClick={async () => { if (await askConfirm({ title: `Delete ${detail.name}?`, message: 'The team, its channels and all messages and files will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete team', danger: true })) void act(() => api.deleteTeam(teamId), onClose) }}><Trash2 size={15} /> Delete team</button>}
        </div>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Dialog>
  )
}

export function ChatMembersDialog({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const chat = useStore(s => s.chats.find(c => c.id === chatId))
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const select = useStore(s => s.select)
  const [picked, setPicked] = useState<string[]>([])
  const [title, setTitle] = useState(chat?.title ?? '')
  const [busy, setBusy] = useState(false)
  if (!chat) return null

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) } }
  return (
    <Dialog title={chatTitle(chat, me.id)} onClose={onClose}>
      <form style={{ display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); void run(() => api.renameChat(chatId, title)) }}>
        <input className="input" value={title} maxLength={80} placeholder="Group name" onChange={e => setTitle(e.target.value)} />
        <button className="btn" disabled={busy}>Rename</button>
      </form>
      <div className="section-label" style={{ padding: 0 }}>People ({chat.members.length})</div>
      <div className="pick-list" style={{ maxHeight: 160 }}>
        {chat.members.map(m => <div key={m.id} className="pick-row" style={{ cursor: 'default' }}><Avatar user={m} size={28} presence /><span>{m.name}{m.id === me.id ? ' (you)' : ''}</span></div>)}
      </div>
      <div className="section-label" style={{ padding: 0 }}>Add people</div>
      <PeoplePicker selected={picked} onChange={setPicked} exclude={chat.members.map(m => m.id)} />
      <div className="actions split">
        <button className="btn danger" onClick={async () => { if (await askConfirm({ title: 'Leave this chat?', message: 'You will stop receiving messages from it.', confirmLabel: 'Leave', danger: true })) void run(async () => { await api.leaveChat(chatId); await select(null); onClose() }) }}><LogOut size={15} /> Leave chat</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={!picked.length || busy} onClick={() => run(async () => { for (const id of picked) await api.addChatMember(chatId, id); setPicked([]) })}>Add</button>
        </div>
      </div>
    </Dialog>
  )
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const me = useStore(s => s.me)!
  const pref = useStore(s => s.presencePref)
  const signOut = useStore(s => s.signOut)
  const toast = useStore(s => s.toast)
  const [title, setTitle] = useState(me.title)
  const [statusMsg, setStatusMsg] = useState(me.statusMsg)
  const [presence, setPresence] = useState(pref)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const u = await api.updateMe({ title, statusMsg, presence })
      useStore.setState(s => ({ me: u, presencePref: presence, users: { ...s.users, [u.id]: u } }))
      onClose()
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title="Your profile" onClose={onClose}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar user={me} size={56} presence />
        <div><div style={{ fontWeight: 700, fontSize: 16 }}>{me.name}</div><div className="muted">{me.email}</div></div>
      </div>
      <label className="field">Status
        <select className="input" value={presence} onChange={e => setPresence(e.target.value as typeof presence)}>
          {(['available', 'busy', 'dnd', 'away', 'offline'] as const).map(p => <option key={p} value={p}>{p === 'offline' ? 'Appear offline' : presenceLabel(p)}</option>)}
        </select>
      </label>
      <label className="field">Status message
        <input className="input" value={statusMsg} maxLength={120} placeholder="What are you up to?" onChange={e => setStatusMsg(e.target.value)} />
      </label>
      <label className="field">Job title
        <input className="input" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
      </label>
      <div className="actions split">
        <button className="btn danger" onClick={() => { onClose(); signOut() }}><LogOut size={15} /> Sign out</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>Save</button>
        </div>
      </div>
    </Dialog>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function NewMeetingDialog({ initialStart, onClose }: { initialStart?: number; onClose: () => void }) {
  const toast = useStore(s => s.toast)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const start0 = initialStart ?? Math.ceil((Date.now() + 15 * 60_000) / (30 * 60_000)) * 30 * 60_000
  const [start, setStart] = useState(toLocalInput(start0))
  const [end, setEnd] = useState(toLocalInput(start0 + 30 * 60_000))
  const [attendees, setAttendees] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function create() {
    const s = new Date(start).getTime(), e = new Date(end).getTime()
    if (!(e > s)) return toast('The meeting must end after it starts', 'error')
    setBusy(true)
    try {
      const m = await api.createMeeting({ title, description, startsAt: s, endsAt: e, attendeeIds: attendees })
      useStore.setState(st => ({ meetings: [...st.meetings.filter(x => x.id !== m.id), m].sort((a, b) => a.startsAt - b.startsAt) }))
      onClose()
    } catch (err) { toast((err as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title="New meeting" onClose={onClose} wide>
      <label className="field">Title
        <input className="input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} autoFocus />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field">Starts<input className="input" type="datetime-local" value={start} onChange={e => { setStart(e.target.value); const t = new Date(e.target.value).getTime(); if (t) setEnd(toLocalInput(t + 30 * 60_000)) }} /></label>
        <label className="field">Ends<input className="input" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <label className="field">Details (optional)
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <div className="section-label" style={{ padding: 0 }}>Invite people</div>
      <PeoplePicker selected={attendees} onChange={setAttendees} />
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!title.trim() || busy} onClick={create}>Schedule</button>
      </div>
    </Dialog>
  )
}

export function MeetingDialog({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const joinCall = useStore(s => s.joinCall)
  const live = useStore(s => s.calls[meeting.id])
  const mine = meeting.attendees.find(a => a.user.id === me.id)
  const isOrganizer = meeting.organizer.id === me.id
  const start = new Date(meeting.startsAt), end = new Date(meeting.endsAt)
  const respond = (r: string) => api.respondMeeting(meeting.id, r).then(m => { useStore.setState(s => ({ meetings: s.meetings.map(x => x.id === m.id ? m : x) })); onClose() }).catch(e => toast(e.message, 'error'))

  return (
    <Dialog title={meeting.title} onClose={onClose}>
      <div className="muted">
        {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {formatTime(meeting.startsAt)} – {formatTime(meeting.endsAt)}
        {live?.length ? <span style={{ color: 'var(--success)', marginLeft: 8 }}>● {live.length} in the meeting</span> : null}
      </div>
      <div>Organised by <b>{meeting.organizer.name}</b>{end.getTime() < Date.now() ? ' · ended' : ''}</div>
      {meeting.description && <div style={{ whiteSpace: 'pre-wrap' }}>{meeting.description}</div>}
      <div className="pick-list">
        {meeting.attendees.map(a => (
          <div key={a.user.id} className="pick-row" style={{ cursor: 'default' }}>
            <Avatar user={a.user} size={26} presence /><span style={{ flex: 1 }}>{a.user.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>{a.response === 'none' ? 'No response' : a.response}</span>
          </div>
        ))}
      </div>
      <div className="actions" style={{ flexWrap: 'wrap' }}>
        {isOrganizer && <button className="btn danger" onClick={async () => { if (await askConfirm({ title: 'Cancel this meeting?', message: 'It will be removed from everyone\'s calendar.', confirmLabel: 'Cancel meeting', danger: true })) void api.deleteMeeting(meeting.id).then(() => { useStore.setState(s => ({ meetings: s.meetings.filter(m => m.id !== meeting.id) })); onClose() }).catch(e => toast(e.message, 'error')) }}>Cancel meeting</button>}
        {mine && !isOrganizer && (
          <>
            <button className="btn" onClick={() => respond('declined')}>Decline</button>
            <button className="btn" onClick={() => respond('tentative')}>Maybe</button>
            <button className="btn" onClick={() => respond('accepted')}>Accept</button>
          </>
        )}
        <button className="btn primary" onClick={() => { onClose(); joinCall(meeting.id, meeting.title) }}>Join</button>
      </div>
    </Dialog>
  )
}
