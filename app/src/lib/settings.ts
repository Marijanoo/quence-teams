import { useSyncExternalStore } from 'react'

// Per-device preferences. Anything that must follow the person between devices (profile, status) lives on the server instead.
export interface Settings {
  // notifications
  notifyDesktop: boolean
  notifyChats: 'all' | 'mentions' | 'off'
  notifyChannels: 'all' | 'mentions' | 'off'
  notifyPreview: boolean
  soundMessage: boolean
  soundCall: boolean
  meetingReminder: number // minutes before the start, 0 = off
  // chat
  enterToSend: boolean
  density: 'comfortable' | 'compact'
  textSize: number // percent
  spellcheck: boolean
  sendTyping: boolean
  bigEmoji: boolean
  // calendar
  weekStart: 0 | 1
  hour12: 'auto' | '12' | '24'
  showWeekends: boolean
  workStart: number
  workEnd: number
  defaultLength: number // minutes
  // devices and calls
  micId: string
  camId: string
  speakerId: string
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGain: boolean
  joinMuted: boolean
  // accessibility and desktop
  reduceMotion: boolean
  startAtLogin: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  notifyDesktop: true, notifyChats: 'all', notifyChannels: 'mentions', notifyPreview: true,
  soundMessage: true, soundCall: true, meetingReminder: 5,
  enterToSend: true, density: 'comfortable', textSize: 100, spellcheck: true, sendTyping: true, bigEmoji: true,
  weekStart: 1, hour12: 'auto', showWeekends: true, workStart: 9, workEnd: 17, defaultLength: 30,
  micId: '', camId: '', speakerId: '', echoCancellation: true, noiseSuppression: true, autoGain: true, joinMuted: false,
  reduceMotion: false, startAtLogin: false
}

const KEY = 'quence-teams-settings'
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function clean(s: Settings): Settings {
  const workStart = clamp(Math.round(s.workStart), 0, 22)
  return {
    ...s,
    textSize: clamp(Math.round(s.textSize), 85, 140),
    workStart,
    workEnd: clamp(Math.round(s.workEnd), workStart + 1, 24),
    defaultLength: clamp(Math.round(s.defaultLength), 5, 480),
    meetingReminder: clamp(Math.round(s.meetingReminder), 0, 120)
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return clean({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
  } catch { /* defaults */ }
  return DEFAULT_SETTINGS
}

let current: Settings = load()
const listeners = new Set<() => void>()

export const getSettings = () => current

// Classes and variables that the stylesheet reads.
export function applySettings(s: Settings = current) {
  const root = document.documentElement
  root.style.setProperty('--msg-size', `${(14 * s.textSize) / 100}px`)
  root.classList.toggle('compact', s.density === 'compact')
  root.classList.toggle('reduce-motion', s.reduceMotion)
}

export function setSettings(patch: Partial<Settings>) {
  current = clean({ ...current, ...patch })
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* not critical */ }
  applySettings(current)
  listeners.forEach(l => l())
  if ('startAtLogin' in patch) window.teamsDesktop?.setLoginItem?.(current.startAtLogin)
}

export const resetSettings = () => setSettings(DEFAULT_SETTINGS)

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
export const useSettings = () => useSyncExternalStore(subscribe, getSettings)

// A short beep for new messages and a repeating one while a call rings. Made with the audio API so no files are needed.
let audio: AudioContext | null = null
export function beep(kind: 'message' | 'ring') {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    const tone = (freq: number, at: number, len: number, gain: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = freq
      g.gain.setValueAtTime(0, ctx.currentTime + at)
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + len + 0.05)
    }
    if (kind === 'message') { tone(880, 0, 0.14, 0.12); tone(1175, 0.12, 0.18, 0.1) }
    else { tone(660, 0, 0.25, 0.14); tone(880, 0.3, 0.25, 0.14) }
  } catch { /* audio can be blocked until the person interacts with the page */ }
}

// Audio constraints from the device settings.
export function audioConstraints(s: Settings = current): MediaTrackConstraints {
  return {
    echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGain,
    ...(s.micId ? { deviceId: { ideal: s.micId } } : {})
  }
}
