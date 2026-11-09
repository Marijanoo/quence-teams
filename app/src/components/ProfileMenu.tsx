import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Camera, Plane, Check, ChevronRight, LogOut, Palette, Pencil, Settings as SettingsIcon, X } from 'lucide-react'
import { api } from '../lib/api'
import { prepareAvatar } from '../lib/avatar'
import { useStore } from '../lib/store'
import type { Presence } from '../lib/types'
import { Avatar, useClickOutside } from './ui'

const STATUSES: { id: Presence; label: string; hint?: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'busy', label: 'Busy' },
  { id: 'dnd', label: 'Do not disturb', hint: 'Mutes notifications' },
  { id: 'away', label: 'Be right back' },
  { id: 'offline', label: 'Appear offline' }
]

// The profile menu in the title bar: a dropdown with status, status message, saved items, settings and sign out.
export function ProfileMenu() {
  const me = useStore(s => s.me)!
  const pref = useStore(s => s.presencePref)
  const toast = useStore(s => s.toast)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'status' | 'message' | 'ooo'>('main')
  const [pos, setPos] = useState({ top: 38, right: 8 })
  const [msg, setMsg] = useState(me.statusMsg)
  const btn = useRef<HTMLButtonElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const close = useCallback(() => { setOpen(false); setView('main') }, [])
  const ref = useClickOutside<HTMLDivElement>(close, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (view === 'main') close(); else setView('main') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view, close])

  function toggle() {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
      setMsg(me.statusMsg)
    }
    setOpen(o => !o)
    setView('main')
  }

  const save = (patch: { presence?: Presence; statusMsg?: string; oooUntil?: number | null; oooMsg?: string }) =>
    api.updateMe(patch).then(u => useStore.setState(s => ({ me: u, presencePref: patch.presence ?? s.presencePref, users: { ...s.users, [u.id]: u } }))).catch(e => toast(e.message, 'error'))

  async function pickPicture(f?: File) {
    if (!f) return
    try {
      const u = await api.uploadAvatar(await prepareAvatar(f))
      useStore.setState(s => ({ me: u, users: { ...s.users, [u.id]: u } }))
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const go = (fn: () => void) => { close(); fn() }
  const current = STATUSES.find(s => s.id === pref) ?? STATUSES[0]

  return (
    <div className="profile-wrap" ref={ref}>
      <button ref={btn} className={`profile-btn${open ? ' active' : ''}`} onClick={toggle} aria-label="Your profile" aria-expanded={open} aria-haspopup="menu" title={me.name}>
        <Avatar user={me} size={22} presence /><span>{me.name}</span>
      </button>
      {open && (
        <div className="pmenu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {view === 'main' && (
            <>
              <div className="pm-card">
                <button className="pm-avatar" onClick={() => file.current?.click()} aria-label="Change your picture" title="Change your picture">
                  <Avatar user={me} size={64} presence />
                  <span className="pm-cam"><Camera size={16} /></span>
                </button>
                <input ref={file} type="file" accept="image/*" hidden onChange={e => { void pickPicture(e.target.files?.[0]); e.target.value = '' }} />
                <div className="pm-who">
                  <b>{me.name}</b>
                  <span>{me.email}</span>
                  {me.title && <span>{me.title}</span>}
                </div>
                <button className="pm-signout" onClick={() => go(() => useStore.getState().signOut())}>Sign out</button>
              </div>
              <button className="pm-row" onClick={() => setView('status')}>
                <i className={`presence-dot ${pref}`} /><span>{current.label}</span><ChevronRight size={15} />
              </button>
              <button className="pm-row" onClick={() => { setMsg(me.statusMsg); setView('message') }}>
                <Pencil size={15} /><span>{me.statusMsg ? me.statusMsg : 'Set status message'}</span>
              </button>
              <button className="pm-row" onClick={() => { setMsg(me.oooMsg ?? ''); setView('ooo') }}>
                <Plane size={15} /><span>{me.oooUntil ? `Out of office until ${new Date(me.oooUntil).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Set out of office'}</span>
              </button>
              <hr />
              <button className="pm-row" onClick={() => go(() => useStore.getState().setQuick('saved'))}><Bookmark size={15} /><span>Saved</span></button>
              <button className="pm-row" onClick={() => go(() => useStore.setState({ appearanceOpen: true }))}><Palette size={15} /><span>Appearance</span></button>
              <button className="pm-row" onClick={() => go(() => useStore.setState({ settingsSection: 'account' }))}><SettingsIcon size={15} /><span>Settings</span></button>
              <hr />
              <button className="pm-row danger" onClick={() => go(() => useStore.getState().signOut())}><LogOut size={15} /><span>Sign out</span></button>
            </>
          )}
          {view === 'status' && (
            <>
              <div className="pm-sub"><button className="icon-btn" onClick={() => setView('main')} aria-label="Back"><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /></button><b>Status</b></div>
              {STATUSES.map(s => (
                <button key={s.id} className="pm-row" onClick={() => { void save({ presence: s.id }); close() }}>
                  <i className={`presence-dot ${s.id}`} /><span>{s.label}{s.hint && <em>{s.hint}</em>}</span>{current.id === s.id && <Check size={15} />}
                </button>
              ))}
              {pref !== 'available' && (
                <>
                  <hr />
                  <button className="pm-row" onClick={() => { void save({ presence: 'available' }); close() }}><X size={15} /><span>Reset status</span></button>
                </>
              )}
            </>
          )}
          {view === 'ooo' && (
            <div className="pm-msg">
              <div className="pm-sub"><button className="icon-btn" onClick={() => setView('main')} aria-label="Back"><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /></button><b>Out of office</b></div>
              <div className="muted" style={{ fontSize: 12.5 }}>People who message you see this note and the date you are back.</div>
              <input className="input" value={msg} maxLength={200} placeholder="Message (optional)" onChange={e => setMsg(e.target.value)} />
              <div className="pm-ooo-choices">
                {oooChoices().map(c => <button key={c.label} className="btn sm" onClick={() => { void save({ oooUntil: c.at, oooMsg: msg.trim() }); close() }}>{c.label}</button>)}
              </div>
              {me.oooUntil && <div className="pm-actions"><button className="btn sm" onClick={() => { void save({ oooUntil: null }); close() }}>I am back</button></div>}
            </div>
          )}
          {view === 'message' && (
            <div className="pm-msg">
              <div className="pm-sub"><button className="icon-btn" onClick={() => setView('main')} aria-label="Back"><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /></button><b>Status message</b></div>
              <input className="input" autoFocus value={msg} maxLength={120} placeholder="What are you up to?" onChange={e => setMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { void save({ statusMsg: msg.trim() }); close() } }} />
              <div className="pm-actions">
                <button className="btn sm" onClick={() => { setMsg(''); void save({ statusMsg: '' }); close() }}>Clear</button>
                <button className="btn primary sm" onClick={() => { void save({ statusMsg: msg.trim() }); close() }}>Done</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Until the start of the working day after the chosen number of days.
function oooChoices(): { label: string; at: number }[] {
  const at = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return d.getTime() }
  return [{ label: 'Until tomorrow', at: at(1) }, { label: '2 days', at: at(2) }, { label: '3 days', at: at(3) }, { label: '1 week', at: at(7) }, { label: '2 weeks', at: at(14) }]
}
