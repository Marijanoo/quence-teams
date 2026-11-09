import { useRef, useState } from 'react'
import { Trash2, Upload, X } from 'lucide-react'
import { api, emojiUrl } from '../lib/api'
import { EMOJIS } from '../lib/format'
import { useStore } from '../lib/store'
import { Dialog } from './ui'

// A reaction or picker entry: a normal emoji, or :name: for a custom image.
export function Emoji({ value }: { value: string }) {
  if (/^:[a-z0-9_]{2,32}:$/.test(value)) return <img className="cemoji" src={emojiUrl(value.slice(1, -1))} alt={value} />
  return <>{value}</>
}

// The full emoji grid with the team's custom emoji first. `onManage` opens the emoji manager.
export function EmojiGrid({ onPick, onManage }: { onPick: (e: string) => void; onManage?: () => void }) {
  const custom = useStore(s => s.customEmoji)
  return (
    <div>
      {custom.length > 0 && <div className="emoji-grid custom">{custom.map(n => <button key={n} onClick={() => onPick(`:${n}:`)} title={`:${n}:`}><Emoji value={`:${n}:`} /></button>)}</div>}
      <div className="emoji-grid">{EMOJIS.map(e => <button key={e} onClick={() => onPick(e)} aria-label={e}>{e}</button>)}</div>
      {onManage && <button className="btn sm ghost" style={{ margin: '4px 6px 2px' }} onClick={onManage}>Custom emoji…</button>}
    </div>
  )
}

// Add and remove custom emoji. Everyone sees them; only the person who added one can remove it.
export function EmojiManager({ onClose }: { onClose: () => void }) {
  const names = useStore(s => s.customEmoji)
  const me = useStore(s => s.me)!
  const load = useStore(s => s.loadEmoji)
  const toast = useStore(s => s.toast)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const [owners, setOwners] = useState<Record<string, string>>({})
  useState(() => { api.emoji().then(l => setOwners(Object.fromEntries(l.map(e => [e.name, e.createdBy])))).catch(() => {}) })

  async function add() {
    if (!file || busy) return
    setBusy(true)
    try { await api.addEmoji(name.trim().toLowerCase(), file); setName(''); setFile(null); await load(); setOwners(Object.fromEntries((await api.emoji()).map(e => [e.name, e.createdBy]))) }
    catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }
  async function remove(n: string) {
    try { await api.removeEmoji(n); await load() } catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <Dialog title="Custom emoji" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>Add a small image (PNG, JPEG, GIF or WebP, up to 256 KB). Type <code>:name:</code> in a message or react with it.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input" placeholder="name (letters, digits, _)" value={name} maxLength={32} onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
          <button className="btn" onClick={() => pick.current?.click()}><Upload size={15} /> {file ? file.name.slice(0, 14) : 'Image'}</button>
          <input ref={pick} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          <button className="btn primary" disabled={!file || name.length < 2 || busy} onClick={add}>Add</button>
        </div>
        <div className="emoji-list">
          {names.length === 0 && <div className="muted">No custom emoji yet.</div>}
          {names.map(n => (
            <div key={n} className="emoji-row"><Emoji value={`:${n}:`} /><code>:{n}:</code><div className="grow" />
              {owners[n] === me.id && <button className="icon-btn" aria-label={`Remove ${n}`} onClick={() => void remove(n)}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}><X size={15} /> Close</button></div>
      </div>
    </Dialog>
  )
}
