import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { avatarColor, initials } from '../lib/format'
import { avatarUrl } from '../lib/api'
import { useStore } from '../lib/store'
import type { Presence, User } from '../lib/types'

export function Avatar({ user, size = 36, presence = false }: { user?: User | null; size?: number; presence?: boolean }) {
  const p = useStore(s => (user ? s.presence[user.id] : undefined)) ?? 'offline'
  const src = user?.avatar ? avatarUrl(user.id, user.avatar) : ''
  return (
    <div className="avatar" style={{ width: size, height: size, background: avatarColor(user ?? undefined), fontSize: size * 0.38 }} aria-hidden>
      {src ? <AvatarImage key={src} src={src} name={user?.name ?? '?'} /> : initials(user?.name ?? '?')}
      {presence && <span className={`presence ${p}`} style={{ width: Math.max(9, size * 0.3), height: Math.max(9, size * 0.3) }} title={presenceLabel(p)} />}
    </div>
  )
}

// The picture, falling back to initials if it cannot be loaded.
function AvatarImage({ src, name }: { src: string; name: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <>{initials(name)}</>
  return <img className="avatar-img" src={src} alt="" draggable={false} onError={() => setBroken(true)} />
}

export function presenceLabel(p: Presence | string): string {
  return ({ available: 'Available', busy: 'Busy', dnd: 'Do not disturb', away: 'Away', offline: 'Offline' } as Record<string, string>)[p] ?? 'Offline'
}

export function GroupAvatar({ users, size = 36 }: { users: User[]; size?: number }) {
  if (users.length <= 1) return <Avatar user={users[0]} size={size} presence />
  const small = Math.round(size * 0.66)
  return (
    <div style={{ width: size, height: size, position: 'relative', flex: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0 }}><Avatar user={users[0]} size={small} /></div>
      <div style={{ position: 'absolute', right: 0, bottom: 0, outline: '2px solid var(--bg)', borderRadius: '50%' }}><Avatar user={users[1]} size={small} /></div>
    </div>
  )
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog" role="dialog" aria-modal aria-label={title} style={wide ? { maxWidth: 580 } : undefined}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}

// Closes when clicking outside of the referenced element.
export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active = true) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOutside() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside, active])
  return ref
}

// Nudges a popup back inside the window if it would run off an edge (and flips it above its anchor at the bottom).
export function useKeepInViewport<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active) return
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    const pad = 8
    let dx = 0
    if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right
    if (r.left + dx < pad) dx = pad - r.left
    if (dx) el.style.transform = `translateX(${dx}px)`
    if (r.bottom > window.innerHeight - pad && r.top - r.height > pad) {
      el.style.top = 'auto'
      el.style.bottom = '100%'
      el.style.marginTop = '0'
      el.style.marginBottom = '4px'
    }
  })
  return ref
}

export interface MenuItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean; divider?: boolean }

export function MenuButton({ items, button, align = 'right' }: { items: MenuItem[]; button: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
  const menuRef = useKeepInViewport<HTMLDivElement>(open)
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)}>{button}</div>
      {open && (
        <div ref={menuRef} className="menu" style={{ top: '100%', [align]: 0, marginTop: 4 }}>
          {items.filter(i => !i.hidden).map((i, idx) => i.divider
            ? <hr key={idx} />
            : <button key={idx} className={i.danger ? 'danger' : ''} onClick={() => { setOpen(false); i.onClick() }}>{i.icon}{i.label}</button>)}
        </div>
      )}
    </div>
  )
}

export function PeoplePicker({ selected, onChange, exclude = [], single = false }: {
  selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; single?: boolean
}) {
  const users = useStore(s => s.users)
  const meId = useStore(s => s.me?.id)
  const [q, setQ] = useState('')
  const list = Object.values(users)
    .filter(u => u.id !== meId && !u.bot && !exclude.includes(u.id))
    .filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const toggle = (id: string) => onChange(single ? [id] : selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {selected.length > 0 && !single && (
        <div className="tags">
          {selected.map(id => (
            <span className="chip" key={id}><Avatar user={users[id]} size={20} /><span>{users[id]?.name}</span>
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => toggle(id)} aria-label={`Remove ${users[id]?.name}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <input className="input" placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      <div className="pick-list">
        {list.map(u => (
          <button key={u.id} className={`pick-row${selected.includes(u.id) ? ' picked' : ''}`} onClick={() => toggle(u.id)}>
            <Avatar user={u} size={28} presence />
            <div style={{ minWidth: 0 }}>
              <div>{u.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
            </div>
          </button>
        ))}
        {!list.length && <div className="empty" style={{ padding: 18 }}>No one found. People appear here after they sign in to Teams once.</div>}
      </div>
    </div>
  )
}

// ---- themed replacement for window.confirm() ----
export function ConfirmHost() {
  const c = useStore(s => s.confirmState)
  if (!c) return null
  const done = (ok: boolean) => { useStore.setState({ confirmState: null }); c.resolve(ok) }
  return (
    <Dialog title={c.title} onClose={() => done(false)}>
      {c.message && <div className="confirm-msg">{c.message}</div>}
      <div className="actions">
        <button className="btn" onClick={() => done(false)}>Cancel</button>
        <button className={`btn ${c.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>{c.confirmLabel}</button>
      </div>
    </Dialog>
  )
}

export interface CtxItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; checked?: boolean; hidden?: boolean; divider?: boolean }

// Right-click menu that opens at the pointer and stays inside the window.
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.left = `${Math.max(6, Math.min(x, window.innerWidth - r.width - 6))}px`
    el.style.top = `${Math.max(6, Math.min(y, window.innerHeight - r.height - 6))}px`
  }, [x, y])
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('contextmenu', down, true)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('contextmenu', down, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return (
    <div ref={ref} className="menu ctx" style={{ position: 'fixed', left: x, top: y }} role="menu" onContextMenu={e => e.preventDefault()}>
      {items.filter(i => !i.hidden).map((i, idx) => i.divider
        ? <hr key={idx} />
        : <button key={idx} role="menuitem" className={i.danger ? 'danger' : ''} onClick={() => { onClose(); i.onClick() }}>
            <span className="ctx-ico">{i.icon}</span><span style={{ flex: 1 }}>{i.label}</span>{i.checked && <Check size={14} />}
          </button>)}
    </div>
  )
}
