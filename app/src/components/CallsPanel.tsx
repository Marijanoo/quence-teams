import { useEffect, useState } from 'react'
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users, Video } from 'lucide-react'
import { api } from '../lib/api'
import { formatShort } from '../lib/format'
import { socket } from '../lib/socket'
import { useStore } from '../lib/store'
import type { CallLog } from '../lib/types'
import { Avatar, Dialog, GroupAvatar, PeoplePicker } from './ui'

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function useCallHistory() {
  const history = useStore(s => s.callHistory)
  const toast = useStore(s => s.toast)
  useEffect(() => {
    api.callHistory().then(h => useStore.setState({ callHistory: h })).catch(e => toast(e.message, 'error'))
  }, [toast])
  return history
}

// Rings (for chats) and joins. Used by "Call back" and "New call".
export function startCall(room: string, kind: CallLog['kind'], title: string) {
  if (kind === 'direct' || kind === 'group') socket.send('call.ring', { convoId: room })
  useStore.getState().joinCall(room, title)
}

function describe(c: CallLog, meId: string) {
  const outgoing = c.startedBy?.id === meId
  if (c.status === 'missed') return { icon: <PhoneMissed size={16} />, label: 'Missed', bad: true }
  if (c.status === 'declined') return { icon: <PhoneMissed size={16} />, label: 'Declined', bad: true }
  if (c.kind === 'channel' || c.kind === 'meeting') return { icon: <Video size={16} />, label: c.kind === 'meeting' ? 'Meeting' : 'Channel meeting', bad: false }
  return outgoing ? { icon: <PhoneOutgoing size={16} />, label: 'Outgoing', bad: false } : { icon: <PhoneIncoming size={16} />, label: 'Incoming', bad: false }
}

export function CallsSidebar({ selectedId, onSelect, onNewCall }: { selectedId: string | null; onSelect: (c: CallLog) => void; onNewCall: () => void }) {
  const history = useCallHistory()
  const me = useStore(s => s.me)!
  const live = useStore(s => s.calls)
  const chats = useStore(s => s.chats)
  const teams = useStore(s => s.teams)
  const joinCall = useStore(s => s.joinCall)

  const liveRooms = Object.keys(live).map(room => {
    const chat = chats.find(c => c.id === room)
    if (chat) return { room, title: chat.title || chat.members.filter(m => m.id !== me.id).map(m => m.name).join(', '), n: live[room].length }
    for (const t of teams) { const ch = t.channels.find(c => c.id === room); if (ch) return { room, title: `${t.name} › ${ch.name}`, n: live[room].length } }
    return null
  }).filter((x): x is { room: string; title: string; n: number } => !!x)

  return (
    <>
      <div className="sidebar-head">
        <h2>Calls</h2>
        <button className="btn primary sm" onClick={onNewCall}><Phone size={14} /> New call</button>
      </div>
      <div className="sidebar-scroll">
        {liveRooms.length > 0 && (
          <>
            <div className="section-label">In progress</div>
            {liveRooms.map(r => (
              <button key={r.room} className="row" onClick={() => joinCall(r.room, r.title)}>
                <Video size={18} color="var(--success)" />
                <div className="grow"><div className="title">{r.title}</div><div className="preview">{r.n} in the call</div></div>
                <span className="btn primary sm" style={{ pointerEvents: 'none' }}>Join</span>
              </button>
            ))}
          </>
        )}
        <div className="section-label">History</div>
        {history.map(c => {
          const d = describe(c, me.id)
          const others = c.participants.filter(p => p.id !== me.id)
          return (
            <button key={c.id} className={`row${selectedId === c.id ? ' active' : ''}`} onClick={() => onSelect(c)}>
              {c.kind === 'direct' || c.kind === 'group' ? <GroupAvatar users={others.length ? others : c.startedBy ? [c.startedBy] : []} size={36} /> : <div className="team-avatar"><Users size={16} /></div>}
              <div className="grow">
                <div className="title" style={d.bad ? { color: 'oklch(0.78 0.16 25)' } : undefined}>{c.title || 'Call'}</div>
                <div className="preview" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{d.icon}{d.label}{c.endedAt && c.status === 'joined' ? ` · ${formatDuration(c.endedAt - c.startedAt)}` : !c.endedAt ? ' · in progress' : ''}</div>
              </div>
              <span className="time">{formatShort(c.startedAt)}</span>
            </button>
          )
        })}
        {!history.length && (
          <div className="empty"><h3>No calls yet</h3><div>Calls and meetings you take part in will be listed here.</div></div>
        )}
      </div>
    </>
  )
}

export function CallDetail({ call }: { call: CallLog | null }) {
  const me = useStore(s => s.me)!
  const goTo = useStore(s => s.goTo)
  const live = useStore(s => s.calls)
  if (!call) {
    return (
      <div className="main"><div className="empty" style={{ margin: 'auto' }}>
        <Phone size={44} color="var(--accent)" />
        <h3>Your call history</h3>
        <div>Pick a call from the list, or start a new one.</div>
      </div></div>
    )
  }
  const d = describe(call, me.id)
  const isLive = !!live[call.room]?.length
  const open = call.kind === 'direct' || call.kind === 'group' || call.kind === 'channel'
  return (
    <div className="main">
      <div className="call-detail">
        <div className="call-detail-head">
          <div className="team-avatar" style={{ width: 56, height: 56, borderRadius: 14 }}>{d.icon}</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{call.title || 'Call'}</h2>
            <div className="muted">{d.label} · {new Date(call.startedAt).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          </div>
        </div>
        <div className="call-stats">
          <div><div className="muted">Duration</div><b>{call.endedAt ? formatDuration(call.endedAt - call.startedAt) : 'In progress'}</b></div>
          <div><div className="muted">Started by</div><b>{call.startedBy?.id === me.id ? 'You' : call.startedBy?.name}</b></div>
          <div><div className="muted">People</div><b>{call.participants.length}</b></div>
        </div>
        <div className="section-label" style={{ padding: 0 }}>Joined</div>
        <div className="pick-list" style={{ maxHeight: 'none' }}>
          {call.participants.map(p => <div key={p.id} className="pick-row" style={{ cursor: 'default' }}><Avatar user={p} size={28} presence /><span>{p.name}{p.id === me.id ? ' (you)' : ''}</span></div>)}
          {!call.participants.length && <div className="empty" style={{ padding: 14 }}>Nobody answered.</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!call.canCallBack} onClick={() => startCall(call.room, call.kind, call.title)}>
            {isLive ? <><Video size={15} /> Join</> : <><Phone size={15} /> {call.kind === 'meeting' ? 'Rejoin' : 'Call back'}</>}
          </button>
          {open && <button className="btn" onClick={() => void goTo(call.room)}>Open chat</button>}
        </div>
      </div>
    </div>
  )
}

export function NewCallDialog({ onClose }: { onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const toast = useStore(s => s.toast)

  async function go() {
    setBusy(true)
    try {
      const chat = await api.createChat(picked)
      useStore.setState(s => ({ chats: s.chats.some(c => c.id === chat.id) ? s.chats : [chat, ...s.chats] }))
      const me = useStore.getState().me!
      const title = chat.title || chat.members.filter(m => m.id !== me.id).map(m => m.name).join(', ')
      startCall(chat.id, chat.type, title)
      onClose()
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false) }
  }

  return (
    <Dialog title="New call" onClose={onClose}>
      <PeoplePicker selected={picked} onChange={setPicked} />
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!picked.length || busy} onClick={go}><Phone size={15} /> Call{picked.length > 1 ? ` ${picked.length} people` : ''}</button>
      </div>
    </Dialog>
  )
}
