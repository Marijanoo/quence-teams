import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Accessibility, Bell, Calendar, Camera, Headphones, Info, Keyboard, MessageSquare, Palette, Shield, Trash2, User as UserIcon, X } from 'lucide-react'
import { api } from '../lib/api'
import { prepareAvatar } from '../lib/avatar'
import { isNative } from '../lib/platform'
import { beep, resetSettings, setSettings, useSettings, type Settings } from '../lib/settings'
import { askConfirm, useStore } from '../lib/store'
import type { Presence } from '../lib/types'
import { Avatar } from './ui'

const SECTIONS = [
  { id: 'account', label: 'Account', icon: UserIcon },
  { id: 'general', label: 'General', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'devices', label: 'Calls and devices', icon: Headphones },
  { id: 'privacy', label: 'Privacy and data', icon: Shield },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info }
] as const

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text"><div>{title}</div>{hint && <div className="set-hint">{hint}</div>}</div>
      <div className="set-ctl">{children}</div>
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>
}

function Toggle({ k, title, hint, s }: { k: keyof Settings; title: string; hint?: ReactNode; s: Settings }) {
  return <Row title={title} hint={hint}><Switch on={s[k] as boolean} onChange={v => setSettings({ [k]: v } as Partial<Settings>)} label={title} /></Row>
}

function Pick<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <select className="input set-select" aria-label={label} value={String(value)} onChange={e => {
      const raw = e.target.value
      onChange((typeof value === 'number' ? Number(raw) : raw) as T)
    }}>
      {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
    </select>
  )
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="set-group">{title && <h4>{title}</h4>}<div className="set-card">{children}</div></section>
}

// ---------- sections ----------

function Account() {
  const me = useStore(s => s.me)!
  const pref = useStore(s => s.presencePref)
  const toast = useStore(s => s.toast)
  const [title, setTitle] = useState(me.title)
  const [statusMsg, setStatusMsg] = useState(me.statusMsg)
  const [presence, setPresence] = useState<Presence>(pref)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const dirty = title !== me.title || statusMsg !== me.statusMsg || presence !== pref
  const apply = (u: typeof me, p?: Presence) => useStore.setState(s => ({ me: u, presencePref: p ?? s.presencePref, users: { ...s.users, [u.id]: u } }))

  async function save() {
    setBusy(true)
    try { apply(await api.updateMe({ title, statusMsg, presence }), presence); toast('Profile saved') }
    catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }
  async function pick(f?: File) {
    if (!f) return
    try { apply(await api.uploadAvatar(await prepareAvatar(f))) } catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <>
      <Group title="Profile picture">
        <div className="set-avatar">
          <Avatar user={me} size={84} presence />
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{me.name}</div>
            <div className="muted">{me.email}</div>
            <div className="set-btns">
              <button className="btn sm" onClick={() => file.current?.click()}><Camera size={14} /> {me.avatar ? 'Change picture' : 'Upload picture'}</button>
              {me.avatar > 0 && <button className="btn sm ghost" onClick={() => api.removeAvatar().then(u => apply(u)).catch(e => toast(e.message, 'error'))}><Trash2 size={14} /> Remove</button>}
            </div>
            <input ref={file} type="file" accept="image/*" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
            <div className="set-hint" style={{ marginTop: 6 }}>PNG, JPEG or WebP. It is cropped to a square.</div>
          </div>
        </div>
      </Group>
      <Group title="About you">
        <Row title="Name" hint="Comes from your Quence account"><span className="muted">{me.name}</span></Row>
        <Row title="Email"><span className="muted">{me.email}</span></Row>
        <Row title="Job title"><input className="input set-input" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></Row>
        <Row title="Status message" hint="Shown next to your name"><input className="input set-input" value={statusMsg} maxLength={120} placeholder="What are you up to?" onChange={e => setStatusMsg(e.target.value)} /></Row>
        <Row title="Status">
          <Pick label="Status" value={presence} onChange={setPresence} options={[['available', 'Available'], ['busy', 'Busy'], ['dnd', 'Do not disturb'], ['away', 'Be right back'], ['offline', 'Appear offline']]} />
        </Row>
      </Group>
      <div className="set-save"><button className="btn primary" disabled={!dirty || busy} onClick={save}>Save changes</button></div>
    </>
  )
}

function General({ s, close }: { s: Settings; close: () => void }) {
  const [login, setLogin] = useState(s.startAtLogin)
  useEffect(() => { void window.teamsDesktop?.getLoginItem?.().then(setLogin) }, [])
  return (
    <>
      <Group title="Look and feel">
        <Row title="Colors" hint="Accent, background and text color"><button className="btn sm" onClick={() => { close(); useStore.setState({ appearanceOpen: true }) }}><Palette size={14} /> Open appearance</button></Row>
        <Row title="Message text size" hint={`${s.textSize}%`}>
          <input type="range" min={85} max={140} step={5} value={s.textSize} aria-label="Message text size" onChange={e => setSettings({ textSize: Number(e.target.value) })} />
        </Row>
        <Row title="Message density" hint="Compact fits more messages on screen">
          <Pick label="Message density" value={s.density} onChange={density => setSettings({ density })} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
        </Row>
      </Group>
      {window.teamsDesktop && (
        <Group title="Desktop app">
          <Row title="Start Quence Teams when I sign in to my computer">
            <Switch on={login} onChange={v => { setLogin(v); setSettings({ startAtLogin: v }) }} label="Start at login" />
          </Row>
        </Group>
      )}
      <p className="set-hint">Zoom the whole app with Ctrl and + / −.</p>
    </>
  )
}

function Notifications({ s }: { s: Settings }) {
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const modes: ['all' | 'mentions' | 'off', string][] = [['all', 'All messages'], ['mentions', 'Only mentions'], ['off', 'Nothing']]
  return (
    <>
      <Group title="Desktop notifications">
        <Toggle k="notifyDesktop" title="Show desktop notifications" s={s}
          hint={perm === 'denied' ? 'Blocked by your system or browser. Allow notifications for Quence Teams there.' : perm === 'unsupported' ? 'Not available here.' : undefined} />
        {perm === 'default' && <Row title="Permission" hint="Notifications need your permission first"><button className="btn sm" onClick={() => void Notification.requestPermission().then(setPerm)}>Allow notifications</button></Row>}
        <Toggle k="notifyPreview" title="Show message previews" hint="Turn off to hide the text in notifications" s={s} />
        <Row title="Test"><button className="btn sm" onClick={() => {
          if (s.soundMessage) beep('message')
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Quence Teams', { body: 'This is how notifications look.', silent: true })
        }}>Send a test</button></Row>
      </Group>
      <Group title="What to notify me about">
        <Row title="Chats"><Pick label="Chat notifications" value={s.notifyChats} onChange={notifyChats => setSettings({ notifyChats })} options={modes} /></Row>
        <Row title="Channels"><Pick label="Channel notifications" value={s.notifyChannels} onChange={notifyChannels => setSettings({ notifyChannels })} options={modes} /></Row>
        <Row title="Meeting reminders">
          <Pick label="Meeting reminder" value={s.meetingReminder} onChange={meetingReminder => setSettings({ meetingReminder })}
            options={[[0, 'Off'], [1, '1 minute before'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before']]} />
        </Row>
      </Group>
      <Group title="Sounds">
        <Toggle k="soundMessage" title="Play a sound for new messages" s={s} />
        <Toggle k="soundCall" title="Ring for incoming calls" s={s} />
        <Row title="Preview ringtone"><button className="btn sm" onClick={() => beep('ring')}>Play</button></Row>
      </Group>
      <p className="set-hint">Notifications are muted while your status is Do not disturb.</p>
    </>
  )
}

function Chat({ s }: { s: Settings }) {
  return (
    <>
      <Group title="Writing">
        <Row title="Send with" hint={s.enterToSend ? 'Shift+Enter adds a new line' : 'Enter adds a new line'}>
          <Pick label="Send with" value={s.enterToSend ? 'enter' : 'ctrl'} onChange={v => setSettings({ enterToSend: v === 'enter' })} options={[['enter', 'Enter'], ['ctrl', 'Ctrl + Enter']]} />
        </Row>
        <Toggle k="spellcheck" title="Check spelling as I type" s={s} />
      </Group>
      <Group title="Reading">
        <Row title="Message density"><Pick label="Message density" value={s.density} onChange={density => setSettings({ density })} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} /></Row>
        <Row title="Message text size" hint={`${s.textSize}%`}><input type="range" min={85} max={140} step={5} value={s.textSize} aria-label="Message text size" onChange={e => setSettings({ textSize: Number(e.target.value) })} /></Row>
        <Toggle k="bigEmoji" title="Show emoji bigger when they are alone in a message" hint="One emoji is the biggest, four are normal size" s={s} />
      </Group>
    </>
  )
}

function CalendarSettings({ s }: { s: Settings }) {
  const hours: [number, string][] = Array.from({ length: 25 }, (_, h) => [h, `${String(h).padStart(2, '0')}:00`])
  return (
    <>
      <Group title="Week">
        <Row title="First day of the week"><Pick label="First day of the week" value={s.weekStart} onChange={weekStart => setSettings({ weekStart: weekStart as 0 | 1 })} options={[[1, 'Monday'], [0, 'Sunday']]} /></Row>
        <Toggle k="showWeekends" title="Show weekends" s={s} />
        <Row title="Time format"><Pick label="Time format" value={s.hour12} onChange={hour12 => setSettings({ hour12 })} options={[['auto', 'Match my system'], ['12', '12-hour'], ['24', '24-hour']]} /></Row>
      </Group>
      <Group title="Working hours">
        <Row title="Day starts" hint="The calendar opens here and shades time outside your hours"><Pick label="Work start" value={s.workStart} onChange={workStart => setSettings({ workStart })} options={hours.slice(0, 23)} /></Row>
        <Row title="Day ends"><Pick label="Work end" value={s.workEnd} onChange={workEnd => setSettings({ workEnd })} options={hours.slice(1)} /></Row>
      </Group>
      <Group title="New meetings">
        <Row title="Default length"><Pick label="Default meeting length" value={s.defaultLength} onChange={defaultLength => setSettings({ defaultLength })} options={[[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1.5 hours']]} /></Row>
      </Group>
    </>
  )
}

type Dev = { id: string; label: string }

function Devices({ s }: { s: Settings }) {
  const [devs, setDevs] = useState<{ mic: Dev[]; cam: Dev[]; spk: Dev[]; labels: boolean }>({ mic: [], cam: [], spk: [], labels: false })
  const [level, setLevel] = useState<number | null>(null)
  const stop = useRef<() => void>(() => {})
  const sinkOk = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

  async function refresh() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const of = (kind: string): Dev[] => all.filter(d => d.kind === kind && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Device ${i + 1}` }))
      setDevs({ mic: of('audioinput'), cam: of('videoinput'), spk: of('audiooutput'), labels: all.some(d => d.label) })
    } catch { /* no media devices here */ }
  }
  useEffect(() => { void refresh(); navigator.mediaDevices?.addEventListener?.('devicechange', refresh); return () => { navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); stop.current() } }, [])

  async function allow() {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true, video: true })).getTracks().forEach(t => t.stop()) } catch {
      try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()) } catch { /* denied */ }
    }
    void refresh()
  }

  async function testMic() {
    stop.current()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: s.micId ? { deviceId: { ideal: s.micId } } : true })
      const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser()
      an.fftSize = 512; src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      const tick = setInterval(() => { an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128)); setLevel(Math.min(1, peak / 64)) }, 60)
      const done = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); void ctx.close(); setLevel(null); stop.current = () => {} }
      stop.current = done
      setTimeout(done, 6000)
    } catch { setLevel(null) }
  }

  const opts = (list: Dev[]): [string, string][] => [['', 'System default'], ...list.map(d => [d.id, d.label] as [string, string])]
  return (
    <>
      {!devs.labels && <Group><Row title="Allow access to your microphone and camera" hint="Your browser only shows device names after you allow it"><button className="btn sm" onClick={allow}>Allow access</button></Row></Group>}
      <Group title="Devices">
        <Row title="Microphone"><Pick label="Microphone" value={s.micId} onChange={micId => setSettings({ micId })} options={opts(devs.mic)} /></Row>
        <Row title="Camera"><Pick label="Camera" value={s.camId} onChange={camId => setSettings({ camId })} options={opts(devs.cam)} /></Row>
        {sinkOk && <Row title="Speaker"><Pick label="Speaker" value={s.speakerId} onChange={speakerId => setSettings({ speakerId })} options={opts(devs.spk)} /></Row>}
        <Row title="Test your microphone" hint="Speak and watch the bar">
          <div className="set-meter"><i style={{ width: `${(level ?? 0) * 100}%` }} /></div>
          <button className="btn sm" onClick={testMic} disabled={level !== null}>Test</button>
        </Row>
      </Group>
      <Group title="Sound quality">
        <Toggle k="echoCancellation" title="Echo cancellation" s={s} />
        <Toggle k="noiseSuppression" title="Noise suppression" s={s} />
        <Toggle k="autoGain" title="Adjust microphone volume automatically" s={s} />
      </Group>
      <Group title="Joining calls">
        <Toggle k="joinMuted" title="Join with my microphone muted" s={s} />
      </Group>
    </>
  )
}

function Privacy({ s }: { s: Settings }) {
  const toast = useStore(s2 => s2.toast)
  return (
    <>
      <Group title="Privacy">
        <Toggle k="sendTyping" title="Let others see when I am typing" s={s} />
        <Row title="Who can see my status" hint="Everyone in Quence Teams. Choose Appear offline in your status to hide it."><span className="muted">Everyone</span></Row>
      </Group>
      <Group title="Data on this device">
        <Row title="Clear unsent drafts" hint="Removes the text you started typing in chats"><button className="btn sm" onClick={() => {
          const me = useStore.getState().me
          if (me) try { localStorage.removeItem(`qt.drafts.${me.id}`) } catch { /* ignore */ }
          useStore.setState({ drafts: {} }); toast('Drafts cleared')
        }}>Clear drafts</button></Row>
        <Row title="Reset all settings" hint="Puts every setting on this page back to its default"><button className="btn sm danger" onClick={async () => {
          if (await askConfirm({ title: 'Reset all settings?', message: 'Notifications, chat, calendar and device settings go back to their defaults. Your colors are not changed.', confirmLabel: 'Reset', danger: true })) { resetSettings(); toast('Settings reset') }
        }}>Reset</button></Row>
      </Group>
    </>
  )
}

function AccessibilitySettings({ s }: { s: Settings }) {
  return (
    <>
      <Group title="Motion and text">
        <Toggle k="reduceMotion" title="Reduce motion" hint="Turns off animations and transitions" s={s} />
        <Row title="Message text size" hint={`${s.textSize}%`}><input type="range" min={85} max={140} step={5} value={s.textSize} aria-label="Message text size" onChange={e => setSettings({ textSize: Number(e.target.value) })} /></Row>
        <Toggle k="bigEmoji" title="Larger emoji when sent alone" s={s} />
      </Group>
      <Group title="Contrast">
        <Row title="Colors and contrast" hint="Raise text brightness or change the background in Appearance"><button className="btn sm" onClick={() => useStore.setState({ settingsSection: null, appearanceOpen: true })}>Open appearance</button></Row>
      </Group>
    </>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Enter', 'Send the message (or Ctrl + Enter, see Chat settings)'], ['Shift + Enter', 'New line'], ['@', 'Mention someone'],
  ['Esc', 'Close a menu, dialog or panel'], ['Ctrl + +  /  Ctrl + −', 'Zoom in or out'], ['Ctrl + 0', 'Reset zoom'],
  ['Right-click a message', 'More actions'], ['Right-click the calendar', 'Create or edit meetings'], ['Drag a meeting', 'Move it to another time or day']
]

function Shortcuts() {
  return <Group title="Keyboard and mouse">{SHORTCUTS.map(([k, d]) => <Row key={k} title={d}><kbd className="kbd">{k}</kbd></Row>)}</Group>
}

function About() {
  const [state, setState] = useState<'idle' | 'checking' | 'latest' | 'newer' | 'error'>('idle')
  const [latest, setLatest] = useState('')
  async function check() {
    setState('checking')
    try {
      const r = await fetch('https://api.github.com/repos/Marijanoo/quence-teams/releases/latest')
      const j = await r.json()
      const v = String(j.tag_name ?? '').replace(/^v/, '')
      setLatest(v)
      const a = v.split('.').map(Number), b = __APP_VERSION__.split('.').map(Number)
      const newer = a.some((n, i) => n !== b[i]) && (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0
      setState(newer ? 'newer' : 'latest')
    } catch { setState('error') }
  }
  return (
    <>
      <Group>
        <div className="set-about">
          <img src="./logo.svg" alt="" width={56} height={56} />
          <div><div style={{ fontWeight: 600, fontSize: 18 }}>Quence Teams</div><div className="muted">Version {__APP_VERSION__} · {window.teamsDesktop ? `Desktop (${window.teamsDesktop.platform})` : isNative ? 'Android' : 'Web'}</div></div>
        </div>
        <Row title="Updates" hint={state === 'newer' ? `Version ${latest} is available.` : state === 'latest' ? 'You have the latest version.' : state === 'error' ? 'Could not check right now.' : window.teamsDesktop ? 'The desktop app updates itself in the background.' : undefined}>
          <button className="btn sm" onClick={check} disabled={state === 'checking'}>{state === 'checking' ? 'Checking…' : 'Check for updates'}</button>
        </Row>
        <Row title="Releases"><a href="https://github.com/Marijanoo/quence-teams/releases" target="_blank" rel="noopener noreferrer">github.com/Marijanoo/quence-teams</a></Row>
      </Group>
    </>
  )
}

export function SettingsDialog() {
  const section = useStore(s => s.settingsSection)
  const s = useSettings()
  const close = () => useStore.setState({ settingsSection: null })
  useEffect(() => {
    if (!section) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section])
  if (!section) return null
  const current = SECTIONS.find(x => x.id === section) ?? SECTIONS[0]

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="dialog set-dialog" role="dialog" aria-modal aria-label="Settings">
        <nav className="set-nav" aria-label="Settings sections">
          <div className="set-title">Settings</div>
          {SECTIONS.map(x => (
            <button key={x.id} className={x.id === current.id ? 'on' : ''} onClick={() => useStore.setState({ settingsSection: x.id })}><x.icon size={16} /><span>{x.label}</span></button>
          ))}
        </nav>
        <div className="set-main">
          <div className="set-head"><h3>{current.label}</h3><button className="icon-btn" onClick={close} aria-label="Close settings"><X size={18} /></button></div>
          <div className="set-content">
            {current.id === 'account' && <Account />}
            {current.id === 'general' && <General s={s} close={close} />}
            {current.id === 'notifications' && <Notifications s={s} />}
            {current.id === 'chat' && <Chat s={s} />}
            {current.id === 'calendar' && <CalendarSettings s={s} />}
            {current.id === 'devices' && <Devices s={s} />}
            {current.id === 'privacy' && <Privacy s={s} />}
            {current.id === 'accessibility' && <AccessibilitySettings s={s} />}
            {current.id === 'shortcuts' && <Shortcuts />}
            {current.id === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}
