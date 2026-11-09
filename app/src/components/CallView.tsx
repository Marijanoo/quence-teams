import { useEffect, useRef, useState } from 'react'
import { audioConstraints, getSettings, useSettings } from '../lib/settings'
import { Camera, CameraOff, Hand, Link2, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Smile, Sparkles, UserX, Users } from 'lucide-react'
import { api, getServer } from '../lib/api'
import { CallSession, type Participant } from '../lib/call'
import { useStore } from '../lib/store'
import { Avatar } from './ui'
import { socket } from '../lib/socket'
import { Emoji } from './CustomEmoji'

function VideoTile({ stream, muted, mirror, screen }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; screen?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream }, [stream])
  // Play through the speaker picked in Settings (where the browser supports choosing one).
  const speaker = useSettings().speakerId
  useEffect(() => {
    const el = ref.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (el?.setSinkId && !muted) void el.setSinkId(speaker || '').catch(() => {})
  }, [speaker, muted])
  // A shared screen only sends frames when something changes, so its track can stay "muted" while the picture is static.
  const hasVideo = !!stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled && (screen || !t.muted))
  return (
    <video ref={ref} autoPlay playsInline muted={muted} className={screen ? 'screen' : ''}
      style={{ display: hasVideo ? 'block' : 'none', transform: mirror ? 'scaleX(-1)' : undefined }} />
  )
}

function hasLiveVideo(stream: MediaStream | null) {
  return !!stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled && !t.muted)
}

// Highlights whoever is currently talking.
function useSpeaking(stream: MediaStream | null) {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return
    const Ctx = window.AudioContext
    const ctx = new Ctx()
    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(data)
      setSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 14)
    }, 200)
    return () => { clearInterval(timer); void ctx.close() }
  }, [stream])
  return speaking
}

function PersonTile({ userId, stream, muted, label, mirror, status, hand, room }: { userId: string; stream: MediaStream | null; muted?: boolean; label?: string; mirror?: boolean; status?: string; hand?: boolean; room?: string }) {
  const account = useStore(s => s.users[userId])
  const guestName = useStore(s => s.callNames[userId])
  const isGuest = userId.startsWith('guest:')
  const user = account ?? (isGuest ? { id: userId, name: guestName ?? 'Guest', email: '', title: '', statusMsg: '', color: 5, avatar: 0 } : undefined)
  const speaking = useSpeaking(muted ? null : stream)
  const showVideo = hasLiveVideo(stream)
  return (
    <div className={`tile${speaking ? ' speaking' : ''}`}>
      <VideoTile stream={stream} muted={muted} mirror={mirror} />
      {!showVideo && <Avatar user={user} size={84} />}
      {hand && <div className="hand-badge" title="Hand raised" aria-label="Hand raised">✋</div>}
      {isGuest && room && <button className="icon-btn tile-x" title="Remove this guest" aria-label="Remove this guest" onClick={() => socket.send('call.remove', { room, guestId: userId })}><UserX size={15} /></button>}
      <div className="label">{label ?? user?.name ?? 'Guest'}{isGuest && <span className="muted"> · guest</span>}{status && <span className="muted"> · {status}</span>}</div>
    </div>
  )
}

function connectionStatus(c: Participant['connection']) {
  if (c === 'connected') return undefined
  if (c === 'failed') return 'connection problem'
  if (c === 'disconnected') return 'reconnecting…'
  return 'connecting…'
}

export function CallView() {
  const call = useStore(s => s.activeCall)!
  const me = useStore(s => s.me)!
  const leaveCall = useStore(s => s.leaveCall)
  const toast = useStore(s => s.toast)
  const [session, setSession] = useState<CallSession | null>(null)
  const [, force] = useState(0)
  const [mic, setMic] = useState(() => !getSettings().joinMuted)
  const [cam, setCam] = useState(false)
  const [error, setError] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [reactOpen, setReactOpen] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const [line, setLine] = useState('')
  const chatOpenRef = useRef(false)
  chatOpenRef.current = chatOpen
  const users = useStore(s => s.users)
  const callNames = useStore(s => s.callNames)
  const lobby = useStore(s => s.lobby.filter(l => l.room === s.activeCall?.room))
  const isConvo = useStore(s => s.chats.some(c => c.id === call.room) || s.teams.some(t => t.channels.some(c => c.id === call.room)))

  useEffect(() => {
    let s: CallSession | null = null
    let cancelled = false
    ;(async () => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false })
        if (getSettings().joinMuted) stream.getAudioTracks().forEach(t => { t.enabled = false })
      } catch {
        // Join as a listener when there is no microphone or permission was denied.
        stream = new MediaStream()
        toast('Microphone unavailable. You joined as a listener.', 'error')
        setMic(false)
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      // TURN relay credentials, so calls also work across strict NATs; plain STUN if the server can't provide them.
      const ice = await api.iceServers().then(r => r.iceServers).catch(() => undefined)
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      s = new CallSession(call.room, me.id, stream, ice)
      s.onChange = () => force(n => n + 1)
      s.onError = m => { setError(m); toast(m, 'error') }
      s.onChat = l => { if (!chatOpenRef.current && l.userId !== me.id) setUnreadChat(n => n + 1) }
      setSession(s)
    })()
    return () => { cancelled = true; s?.leave() }
  }, [call.room, me.id, toast])

  if (!session) return <div className="call"><div className="empty" style={{ alignSelf: 'center' }}>Joining…</div></div>

  const parts: Participant[] = session.participants
  const tiles: { key: string; node: JSX.Element }[] = [
    { key: 'me', node: <PersonTile userId={me.id} stream={session.local} muted mirror label="You" hand={session.hands.has(me.id)} /> }
  ]
  const shared = session.screenPreview
  if (shared) tiles.push({ key: 'my-screen', node: <div className="tile screen"><VideoTile stream={shared} muted screen /><div className="label">Your screen</div></div> })
  for (const p of parts) {
    tiles.push({ key: p.userId, node: <PersonTile userId={p.userId} stream={p.stream} status={connectionStatus(p.connection)} hand={session.hands.has(p.userId)} room={call.room} /> })
    if (p.screen) tiles.push({ key: p.userId + '-screen', node: <div className="tile screen"><VideoTile stream={p.screen} screen /><div className="label">Screen</div></div> })
  }
  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : 3

  return (
    <div className="call" role="dialog" aria-label="Call">
      <div className="call-top">
        <b>{call.title}</b>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn sm" onClick={async () => {
            try {
              const l = await api.createGuestLink(call.room)
              const url = (getServer() || location.origin) + l.path
              await navigator.clipboard?.writeText(url).catch(() => {})
              toast('Guest link copied. It works for 24 hours, and you let each guest in yourself.', 'info')
            } catch (e) { toast((e as Error).message, 'error') }
          }}><Link2 size={14} /> Invite a guest</button>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Users size={15} /> {parts.length + 1}</span>
        </span>
      </div>
      {lobby.length > 0 && (
        <div className="lobby" role="alert">
          {lobby.map(l => (
            <div key={l.guest.id} className="lobby-row">
              <span><b>{l.guest.name}</b> wants to join</span>
              <button className="btn sm" onClick={() => socket.send('call.admit', { room: call.room, guestId: l.guest.id, allow: false })}>Deny</button>
              <button className="btn primary sm" onClick={() => socket.send('call.admit', { room: call.room, guestId: l.guest.id, allow: true })}>Let in</button>
            </div>
          ))}
        </div>
      )}
 <div className="call-reactions" aria-hidden>
        {session.reactions.map(r => <span key={r.id} className="call-react" style={{ left: `${10 + (r.id * 37) % 80}%` }}><Emoji value={r.emoji} /><small>{r.userId === me.id ? 'You' : (users[r.userId]?.name ?? callNames[r.userId] ?? '').split(' ')[0]}</small></span>)}
      </div>
      <div className="call-body">
      <div className="call-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {error && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
        {tiles.map(t => <div key={t.key} style={{ display: 'contents' }}>{t.node}</div>)}
        {parts.length === 0 && <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>Waiting for others to join…</div>}
      </div>
      {chatOpen && (
        <aside className="call-chat" aria-label="Call chat">
          <div className="call-chat-lines">
            {session.chat.length === 0 && <div className="muted" style={{ padding: 8 }}>{isConvo ? 'Messages here are also posted in the conversation.' : 'Messages here disappear when the call ends.'}</div>}
            {session.chat.map((l, i) => <div key={i} className="call-chat-line"><b>{l.userId === me.id ? 'You' : users[l.userId]?.name ?? callNames[l.userId] ?? 'Someone'}</b> {l.text}</div>)}
          </div>
          <form onSubmit={e => {
            e.preventDefault()
            const text = line.trim()
            if (!text) return
            session.say(text)
            if (isConvo) void useStore.getState().sendMessage(call.room, text)
            setLine('')
          }}>
            <input className="input" autoFocus value={line} maxLength={500} placeholder="Message everyone" onChange={e => setLine(e.target.value)} />
          </form>
        </aside>
      )}
      </div>
      <div className="call-controls">
        <button className={`round${mic ? '' : ' off'}`} aria-label={mic ? 'Mute' : 'Unmute'} title={mic ? 'Mute' : 'Unmute'}
          onClick={() => { session.setMicEnabled(!mic); setMic(!mic) }} disabled={!session.local.getAudioTracks().length}>
          {mic ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button className={`round${cam ? ' on' : ''}`} aria-label={cam ? 'Turn camera off' : 'Turn camera on'} title="Camera"
          onClick={async () => setCam(await session.setCameraEnabled(!cam))}>
          {cam ? <Camera size={20} /> : <CameraOff size={20} />}
        </button>
        {cam && session.canBlur && (
          <button className={`round${session.blurred ? ' on' : ''}`} aria-label="Blur background" title="Blur background" onClick={() => void session.setBlur(!session.blurred)}><Sparkles size={20} /></button>
        )}
        <button className={`round${session.hands.has(me.id) ? ' on' : ''}`} aria-label={session.hands.has(me.id) ? 'Lower hand' : 'Raise hand'} title="Raise hand" onClick={() => session.setHand(!session.hands.has(me.id))}><Hand size={20} /></button>
        <div style={{ position: 'relative' }}>
          <button className="round" aria-label="Send a reaction" title="React" onClick={() => setReactOpen(o => !o)}><Smile size={20} /></button>
          {reactOpen && <div className="call-react-pop">{['👍', '👏', '❤️', '😂', '😮', '🎉'].map(e => <button key={e} onClick={() => { session.react(e); setReactOpen(false) }}>{e}</button>)}</div>}
        </div>
        <button className={`round${chatOpen ? ' on' : ''}`} aria-label="Call chat" title="Chat" onClick={() => { setChatOpen(o => !o); setUnreadChat(0) }}>
          <MessageSquare size={20} />{unreadChat > 0 && <span className="round-badge">{unreadChat}</span>}
        </button>
        {typeof navigator.mediaDevices?.getDisplayMedia === 'function' && (
          <button className={`round${session.sharingScreen ? ' on' : ''}`} aria-label="Share screen" title="Share screen" onClick={async () => { await session.toggleScreenShare(); force(n => n + 1) }}>
            <MonitorUp size={20} />
          </button>
        )}
        <button className="round end" aria-label="Leave call" title="Leave" onClick={leaveCall}><PhoneOff size={20} /></button>
      </div>
    </div>
  )
}
