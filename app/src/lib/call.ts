import { getSettings } from './settings'
import { socket } from './socket'

export interface Participant {
  userId: string
  stream: MediaStream | null   // camera + microphone
  screen: MediaStream | null   // screen share
  connection: RTCPeerConnectionState | 'new'
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

// Full-mesh WebRTC: every participant connects to every other one. Fine for small calls (up to ~6).
// Signalling (offers, answers, ICE candidates) is relayed by the Teams server over the WebSocket.
export class CallSession {
  private peers = new Map<string, { pc: RTCPeerConnection; makingOffer: boolean; polite: boolean; streams: Map<string, MediaStream>; screenId: string | null | undefined; pendingIce: RTCIceCandidateInit[] }>()
  private offs: (() => void)[] = []
  private screenTrack: MediaStreamTrack | null = null
  private screenStream: MediaStream | null = null
  local: MediaStream
  onChange: () => void = () => {}
  onError: (msg: string) => void = () => {}
  closed = false

  constructor(private room: string, private meId: string, local: MediaStream, private iceServers: RTCIceServer[] = FALLBACK_ICE) {
    this.local = local
    this.offs.push(
      socket.on('call.peers', d => { if (d.room === room) for (const id of d.peers) this.addPeer(id, true) }),
      socket.on('call.peer-joined', d => { if (d.room === room) this.addPeer(d.userId, false) }),
      socket.on('call.peer-left', d => { if (d.room === room) this.removePeer(d.userId) }),
      socket.on('call.signal', d => { if (d.room === room) void this.onSignal(d.from, d.signal) }),
      socket.on('call.error', d => { if (d.room === room) this.onError(d.error) }),
      socket.on('call.kicked', d => { if (d.room === room) { this.onError('You joined this call from another window'); this.leave() } }),
      // the socket dropped: peers keep their direct media, but we need to re-announce ourselves on reconnect
      socket.on('hello', () => { if (!this.closed) socket.send('call.join', { room }) })
    )
    socket.send('call.join', { room })
  }

  get participants(): Participant[] {
    return [...this.peers.entries()].map(([userId, p]) => {
      const live = [...p.streams.values()].filter(s => s.getTracks().some(t => t.readyState === 'live'))
      // The sharer announces the screen stream id; if that message was missed, a second video-only stream is the screen.
      let screen = live.find(s => s.id === p.screenId) ?? null
      if (!screen && p.screenId === undefined && live.length > 1) screen = live.find(s => !s.getAudioTracks().length && s.getVideoTracks().length) ?? null
      return {
        userId,
        stream: live.find(s => s !== screen) ?? null,
        screen,
        connection: p.pc.connectionState
      }
    })
  }

  private addPeer(userId: string, initiator: boolean) {
    if (userId === this.meId || this.peers.has(userId)) return
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const peer = { pc, makingOffer: false, polite: !initiator, streams: new Map<string, MediaStream>(), screenId: undefined as string | null | undefined, pendingIce: [] as RTCIceCandidateInit[] }
    this.peers.set(userId, peer)

    for (const track of this.local.getTracks()) pc.addTrack(track, this.local)
    if (this.screenTrack && this.screenStream) {
      pc.addTrack(this.screenTrack, this.screenStream)
      socket.send('call.signal', { room: this.room, to: userId, signal: { screenId: this.screenStream.id } })
    }

    pc.ontrack = e => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      peer.streams.set(stream.id, stream)
      stream.onremovetrack = () => this.onChange()
      stream.onaddtrack = () => this.onChange()
      e.track.onended = () => this.onChange()
      e.track.onmute = () => this.onChange()
      e.track.onunmute = () => this.onChange()
      this.onChange()
    }
    pc.onicecandidate = e => {
      if (e.candidate) socket.send('call.signal', { room: this.room, to: userId, signal: { candidate: e.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce()
      // A brief 'disconnected' often heals by itself; if it doesn't, renegotiate the connection path.
      if (pc.connectionState === 'disconnected') setTimeout(() => { if (pc.connectionState === 'disconnected') pc.restartIce() }, 4000)
      this.onChange()
    }
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true
        await pc.setLocalDescription()
        socket.send('call.signal', { room: this.room, to: userId, signal: { description: pc.localDescription } })
      } catch (e) {
        console.error('negotiation failed', e)
      } finally {
        peer.makingOffer = false
      }
    }
    this.onChange()
  }

  // "Perfect negotiation": whichever side is polite backs off if both send an offer at once.
  private async onSignal(from: string, signal: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; screenId?: string | null }) {
    if (!this.peers.has(from)) this.addPeer(from, false)
    const peer = this.peers.get(from)
    if (!peer) return
    const { pc } = peer
    try {
      if ('screenId' in signal) {
        peer.screenId = signal.screenId ?? null
        this.onChange()
      } else if (signal.description) {
        const collision = signal.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
        if (collision && !peer.polite) return
        await pc.setRemoteDescription(signal.description)
        for (const c of peer.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {})
        if (signal.description.type === 'offer') {
          await pc.setLocalDescription()
          socket.send('call.signal', { room: this.room, to: from, signal: { description: pc.localDescription } })
        }
      } else if (signal.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => {})
        else peer.pendingIce.push(signal.candidate)
      }
    } catch (e) {
      console.error('signal failed', e)
    }
  }

  private removePeer(userId: string) {
    const peer = this.peers.get(userId)
    if (!peer) return
    peer.pc.close()
    this.peers.delete(userId)
    this.onChange()
  }

  setMicEnabled(on: boolean) { this.local.getAudioTracks().forEach(t => { t.enabled = on }) }

  async setCameraEnabled(on: boolean) {
    const video = this.local.getVideoTracks()[0]
    if (video) { video.enabled = on; return on }
    if (!on) return false
    try {
      const camId = getSettings().camId
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, ...(camId ? { deviceId: { ideal: camId } } : {}) } })
      const track = cam.getVideoTracks()[0]
      this.local.addTrack(track)
      for (const { pc } of this.peers.values()) pc.addTrack(track, this.local)
      this.onChange()
      return true
    } catch {
      this.onError('Could not access your camera')
      return false
    }
  }

  get sharingScreen() { return !!this.screenTrack }

  get screenPreview() { return this.screenStream }

  private announceScreen(screenId: string | null) {
    for (const userId of this.peers.keys()) socket.send('call.signal', { room: this.room, to: userId, signal: { screenId } })
  }

  async toggleScreenShare(): Promise<boolean> {
    if (this.screenTrack) { this.stopScreen(); return false }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = display.getVideoTracks()[0]
      track.contentHint = 'detail' // text and UI stay sharp instead of dropping resolution
      this.screenTrack = track
      this.screenStream = display
      track.onended = () => { this.stopScreen(); this.onChange() }
      for (const { pc } of this.peers.values()) pc.addTrack(track, display)
      this.announceScreen(display.id)
      this.onChange()
      return true
    } catch (e) {
      // In a browser, NotAllowedError means the person closed the picker. In the desktop app there is no picker,
      // so it means the OS blocked capture (macOS screen-recording permission).
      if ((e as DOMException).name !== 'NotAllowedError' || window.teamsDesktop) {
        this.onError('Could not start screen sharing. On a Mac, allow Quence Teams under System Settings, Privacy & Security, Screen Recording, then restart the app.')
      }
      return false
    }
  }

  private stopScreen() {
    const track = this.screenTrack
    if (!track) return
    this.screenTrack = null
    this.screenStream = null
    this.announceScreen(null)
    track.stop()
    for (const { pc } of this.peers.values()) {
      const sender = pc.getSenders().find(s => s.track === track)
      if (sender) pc.removeTrack(sender)
    }
  }

  leave() {
    if (this.closed) return
    this.closed = true
    socket.send('call.leave', { room: this.room })
    this.offs.forEach(off => off())
    this.stopScreen()
    for (const { pc } of this.peers.values()) pc.close()
    this.peers.clear()
    this.local.getTracks().forEach(t => t.stop())
  }
}
