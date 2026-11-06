import { useEffect, useRef, useState } from 'react'
import { audioConstraints, getSettings, useSettings } from '../lib/settings'
import { Camera, CameraOff, Mic, MicOff, MonitorUp, PhoneOff, Users } from 'lucide-react'
import { api } from '../lib/api'
import { CallSession, type Participant } from '../lib/call'
import { useStore } from '../lib/store'
import { Avatar } from './ui'

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

function PersonTile({ userId, stream, muted, label, mirror, status }: { userId: string; stream: MediaStream | null; muted?: boolean; label?: string; mirror?: boolean; status?: string }) {
  const user = useStore(s => s.users[userId])
  const speaking = useSpeaking(muted ? null : stream)
  const showVideo = hasLiveVideo(stream)
  return (
    <div className={`tile${speaking ? ' speaking' : ''}`}>
      <VideoTile stream={stream} muted={muted} mirror={mirror} />
      {!showVideo && <Avatar user={user} size={84} />}
      <div className="label">{label ?? user?.name ?? 'Guest'}{status && <span className="muted"> · {status}</span>}</div>
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
      setSession(s)
    })()
    return () => { cancelled = true; s?.leave() }
  }, [call.room, me.id, toast])

  if (!session) return <div className="call"><div className="empty" style={{ alignSelf: 'center' }}>Joining…</div></div>

  const parts: Participant[] = session.participants
  const tiles: { key: string; node: JSX.Element }[] = [
    { key: 'me', node: <PersonTile userId={me.id} stream={session.local} muted mirror label="You" /> }
  ]
  const shared = session.screenPreview
  if (shared) tiles.push({ key: 'my-screen', node: <div className="tile screen"><VideoTile stream={shared} muted screen /><div className="label">Your screen</div></div> })
  for (const p of parts) {
    tiles.push({ key: p.userId, node: <PersonTile userId={p.userId} stream={p.stream} status={connectionStatus(p.connection)} /> })
    if (p.screen) tiles.push({ key: p.userId + '-screen', node: <div className="tile screen"><VideoTile stream={p.screen} screen /><div className="label">Screen</div></div> })
  }
  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : 3

  return (
    <div className="call" role="dialog" aria-label="Call">
      <div className="call-top">
        <b>{call.title}</b>
        <span className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Users size={15} /> {parts.length + 1}</span>
      </div>
      <div className="call-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {error && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
        {tiles.map(t => <div key={t.key} style={{ display: 'contents' }}>{t.node}</div>)}
        {parts.length === 0 && <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>Waiting for others to join…</div>}
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
