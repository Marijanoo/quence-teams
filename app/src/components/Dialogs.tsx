import { useEffect, useState } from 'react'
import { Crown, LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { api, getServer } from '../lib/api'
import { askConfirm, chatTitle, useStore } from '../lib/store'
import type { Meeting, Team, TeamDetail, Webhook } from '../lib/types'
import { Avatar, Dialog, PeoplePicker } from './ui'
import { formatTime } from '../lib/format'
import { getSettings, useSettings } from '../lib/settings'

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

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function NewMeetingDialog({ initialStart, initialEnd, meeting, onClose }: { initialStart?: number; initialEnd?: number; meeting?: Meeting; onClose: () => void }) {
  const toast = useStore(s => s.toast)
  const meId = useStore(s => s.me!.id)
  const defaultLength = useSettings().defaultLength
  const [title, setTitle] = useState(meeting?.title ?? '')
  const [description, setDescription] = useState(meeting?.description ?? '')
  const start0 = meeting?.startsAt ?? initialStart ?? Math.ceil((Date.now() + 15 * 60_000) / (30 * 60_000)) * 30 * 60_000
  const [start, setStart] = useState(toLocalInput(start0))
  const [end, setEnd] = useState(toLocalInput(meeting?.endsAt ?? initialEnd ?? start0 + defaultLength * 60_000))
  const [attendees, setAttendees] = useState<string[]>(() => meeting ? meeting.attendees.filter(a => a.user.id !== meId).map(a => a.user.id) : [])
  const [busy, setBusy] = useState(false)
  const [recur, setRecur] = useState<string>(meeting?.recur ?? 'none')
  const [until, setUntil] = useState(meeting?.recurUntil ? toLocalInput(meeting.recurUntil).slice(0, 10) : '')
  const users = useStore(s => s.users)
  const [busyMap, setBusyMap] = useState<Record<string, [number, number][]> | null>(null)

  // Who is free: only time ranges come back from the server, never the titles of other people's meetings.
  const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  useEffect(() => {
    const t = new Date(start).getTime()
    if (!t || !attendees.length) { setBusyMap(null); return }
    let alive = true
    api.freeBusy([meId, ...attendees], dayStart(t), dayStart(t) + 86_400_000).then(m => { if (alive) setBusyMap(m) }).catch(() => { if (alive) setBusyMap(null) })
    return () => { alive = false }
  }, [start, attendees, meId])
  const conflicts = busyMap ? Object.entries(busyMap).filter(([id, ranges]) => id !== meeting?.organizer.id && ranges.some(([a, b]) => a < new Date(end).getTime() && b > new Date(start).getTime() && !(meeting && a === meeting.startsAt && b === meeting.endsAt))).map(([id]) => users[id]?.name ?? 'Someone') : []

  // The first half hour in the next two weeks of working hours when everyone invited is free.
  async function findTime() {
    const len = Math.max(15 * 60_000, new Date(end).getTime() - new Date(start).getTime() || 30 * 60_000)
    const from = Math.max(Date.now(), dayStart(Date.now()))
    const ids = [meId, ...attendees]
    const all: [number, number][] = []
    for (let off = 0; off < 14; off += 7) {
      const part = await api.freeBusy(ids, from + off * 86_400_000, from + (off + 7) * 86_400_000).catch(() => null)
      if (!part) return toast('Could not check calendars', 'error')
      for (const r of Object.values(part)) all.push(...r)
    }
    const { workStart, workEnd } = getSettings()
    for (let d = 0; d < 14; d++) {
      const day = new Date(from); day.setDate(day.getDate() + d)
      if ([0, 6].includes(day.getDay())) continue
      for (let m = workStart * 60; m + len / 60_000 <= workEnd * 60; m += 30) {
        const s = new Date(day); s.setHours(0, m, 0, 0)
        const a = s.getTime(), b = a + len
        if (a < Date.now()) continue
        if (!all.some(([x, y]) => x < b && y > a)) { setStart(toLocalInput(a)); setEnd(toLocalInput(b)); return }
      }
    }
    toast('No shared free time in the next two weeks', 'error')
  }

  async function submit() {
    const s = new Date(start).getTime(), e = new Date(end).getTime()
    if (!(e > s)) return toast('The meeting must end after it starts', 'error')
    setBusy(true)
    try {
      const m = meeting
        ? await api.updateMeeting(meeting.id, { title, description, startsAt: s, endsAt: e, attendeeIds: attendees, recur, recurUntil: recur === 'none' || !until ? null : new Date(until + 'T23:59').getTime() })
        : await api.createMeeting({ title, description, startsAt: s, endsAt: e, attendeeIds: attendees, recur, recurUntil: recur === 'none' || !until ? null : new Date(until + 'T23:59').getTime() })
      void m
      await useStore.getState().reloadMeetings()
      onClose()
    } catch (err) { toast((err as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title={meeting ? 'Edit meeting' : 'New meeting'} onClose={onClose} wide>
      <label className="field">Title
        <input className="input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} autoFocus />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field">Starts<input className="input" type="datetime-local" value={start} onChange={e => {
          // Moving the start keeps the length of the meeting.
          const was = new Date(start).getTime(), len = new Date(end).getTime() - was
          setStart(e.target.value)
          const t = new Date(e.target.value).getTime()
          if (t) setEnd(toLocalInput(t + (len > 0 ? len : defaultLength * 60_000)))
        }} /></label>
        <label className="field">Ends<input className="input" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field">Repeats
          <select className="input" value={recur} onChange={e => setRecur(e.target.value)}>
            <option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option>
            <option value="weekly">Every week</option><option value="monthly">Every month</option>
          </select>
        </label>
        {recur !== 'none' && <label className="field">Until (optional)<input className="input" type="date" value={until} onChange={e => setUntil(e.target.value)} /></label>}
      </div>
      <label className="field">Details (optional)
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <div className="section-label" style={{ padding: 0 }}>Invite people</div>
      <PeoplePicker selected={attendees} onChange={setAttendees} />
      {attendees.length > 0 && (
        <div className={`busy-note${conflicts.length ? ' warn' : ''}`} role="status">
          {conflicts.length ? `Busy at that time: ${conflicts.join(', ')}.` : busyMap ? 'Everyone is free at that time.' : 'Checking calendars…'}
          <button className="btn sm" type="button" onClick={() => void findTime()}>Find a time</button>
        </div>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!title.trim() || busy} onClick={submit}>{meeting ? 'Save' : 'Schedule'}</button>
      </div>
    </Dialog>
  )
}

export function MeetingDialog({ meeting, onClose, onEdit }: { meeting: Meeting; onClose: () => void; onEdit?: () => void }) {
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const joinCall = useStore(s => s.joinCall)
  const live = useStore(s => s.calls[meeting.id])
  const mine = meeting.attendees.find(a => a.user.id === me.id)
  const isOrganizer = meeting.organizer.id === me.id
  const start = new Date(meeting.startsAt), end = new Date(meeting.endsAt)
  const respond = (r: string) => api.respondMeeting(meeting.id, r).then(() => { void useStore.getState().reloadMeetings(); onClose() }).catch(e => toast(e.message, 'error'))

  return (
    <Dialog title={meeting.title} onClose={onClose}>
      <div className="muted">
        {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {formatTime(meeting.startsAt)} – {formatTime(meeting.endsAt)}
        {meeting.recur && meeting.recur !== 'none' ? <span> · repeats {({ daily: 'every day', weekdays: 'every weekday', weekly: 'every week', monthly: 'every month' } as Record<string, string>)[meeting.recur]}</span> : null}
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
        {isOrganizer && onEdit && <button className="btn" onClick={onEdit}>Edit</button>}
        {isOrganizer && <button className="btn danger" onClick={async () => { if (await askConfirm({ title: meeting.recur && meeting.recur !== 'none' ? 'Cancel the whole series?' : 'Cancel this meeting?', message: 'It will be removed from everyone\'s calendar.', confirmLabel: 'Cancel meeting', danger: true })) void api.deleteMeeting(meeting.id).then(() => { void useStore.getState().reloadMeetings(); onClose() }).catch(e => toast(e.message, 'error')) }}>Cancel meeting</button>}
        {mine && !isOrganizer && (
          <>
            <button className="btn" onClick={() => respond('declined')}>Decline</button>
            <button className="btn" onClick={() => respond('tentative')}>Maybe</button>
            <button className="btn" onClick={() => respond('accepted')}>Accept</button>
          </>
        )}
        <button className="btn" onClick={async () => {
          try {
            const l = await api.createGuestLink(meeting.id, 24 * 7)
            await navigator.clipboard?.writeText((getServer() || location.origin) + l.path).catch(() => {})
            toast('Guest link copied. It works for 7 days, and you let each guest in yourself.', 'info')
          } catch (e) { toast((e as Error).message, 'error') }
        }}>Copy guest link</button>
        <button className="btn primary" onClick={() => { onClose(); joinCall(meeting.id, meeting.title) }}>Join</button>
      </div>
    </Dialog>
  )
}

// Incoming webhooks: each one posts into this channel as its own bot. Anyone with the address can post, so keep it secret.
export function WebhooksDialog({ channelId, channelName, onClose }: { channelId: string; channelName: string; onClose: () => void }) {
  const toast = useStore(s => s.toast)
  const [hooks, setHooks] = useState<Webhook[] | null>(null)
  const [name, setName] = useState('')
  const base = getServer() || location.origin
  const load = () => api.webhooks(channelId).then(setHooks).catch(e => { setHooks([]); toast(e.message, 'error') })
  useEffect(() => { void load() }, [channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!name.trim()) return
    try { await api.addWebhook(channelId, name.trim()); setName(''); await load() } catch (e) { toast((e as Error).message, 'error') }
  }
  const copy = (h: Webhook) => navigator.clipboard?.writeText(base + h.path).then(() => toast('Webhook address copied', 'info')).catch(() => toast('Could not copy, select the address instead', 'error'))

  return (
    <Dialog title={`Webhooks for #${channelName}`} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Send a POST with JSON like <code>{'{"text": "Build passed"}'}</code> to a webhook address and it appears here as a message from that bot. Links and @mentions work.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Name, for example Deploys" value={name} maxLength={40} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void add() }} />
          <button className="btn primary" disabled={!name.trim()} onClick={add}>Create</button>
        </div>
        {hooks === null && <div className="muted">Loading…</div>}
        {hooks?.map(h => (
          <div key={h.id} className="hook-row">
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{h.name}</b>
              <div className="hook-url">{base}{h.path}</div>
            </div>
            <button className="btn sm" onClick={() => copy(h)}>Copy</button>
            <button className="btn sm danger" onClick={async () => { if (await askConfirm({ title: `Delete ${h.name}?`, message: 'Anything still posting to this address will stop working.', confirmLabel: 'Delete', danger: true })) { await api.removeWebhook(channelId, h.id).catch(e => toast(e.message, 'error')); await load() } }}>Delete</button>
          </div>
        ))}
        {hooks?.length === 0 && <div className="muted">No webhooks yet.</div>}
      </div>
    </Dialog>
  )
}
