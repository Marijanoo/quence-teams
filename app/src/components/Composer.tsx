import { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, Paperclip, Send, Smile, X, Type } from 'lucide-react'
import { api } from '../lib/api'
import { EMOJIS, formatBytes, mentionsToRaw } from '../lib/format'
import { useStore } from '../lib/store'
import { socket } from '../lib/socket'
import type { User } from '../lib/types'
import { Avatar, useClickOutside } from './ui'

const MAX_FILE = 25 * 1024 * 1024

export function Composer({ convoId, parentId, placeholder, allowSubject, onSent, members }: {
  convoId: string; parentId?: string; placeholder: string; allowSubject?: boolean; onSent?: () => void; members: User[]
}) {
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [showSubject, setShowSubject] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastTyping = useRef(0)
  const emojiRef = useClickOutside<HTMLDivElement>(() => setEmoji(false), emoji)

  // Drafts survive switching conversations.
  const draftKey = `qt.draft.${convoId}.${parentId ?? ''}`
  useEffect(() => {
    try { setText(sessionStorage.getItem(draftKey) ?? '') } catch { setText('') }
    setSubject(''); setShowSubject(false); setFiles([]); setMention(null)
  }, [draftKey])
  useEffect(() => {
    try { text ? sessionStorage.setItem(draftKey, text) : sessionStorage.removeItem(draftKey) } catch { /* storage unavailable */ }
  }, [text, draftKey])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [text])

  const candidates = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    const list: { id: string; name: string; user?: User }[] = members.filter(u => u.id !== me.id && u.name.toLowerCase().includes(q)).map(u => ({ id: u.id, name: u.name, user: u }))
    if (members.length > 2 && 'everyone'.startsWith(q)) list.unshift({ id: 'everyone', name: 'everyone' })
    return list.slice(0, 6)
  }, [mention, members, me.id])

  function onChange(value: string, caret: number) {
    setText(value)
    const before = value.slice(0, caret)
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before)
    setMention(m ? { start: caret - m[2].length - 1, query: m[2] } : null)
    setMentionIdx(0)
    if (value && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now()
      socket.send('typing', { convoId, parentId })
    }
  }

  function insertMention(c: { id: string; name: string }) {
    if (!mention) return
    const el = area.current!
    const caret = el.selectionStart
    const token = `@${c.name} `
    const next = text.slice(0, mention.start) + token + text.slice(caret)
    setText(next)
    setMention(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(mention.start + token.length, mention.start + token.length) })
  }

  function addFiles(list: FileList | File[]) {
    const incoming = [...list]
    const tooBig = incoming.find(f => f.size > MAX_FILE)
    if (tooBig) toast(`${tooBig.name} is larger than 25 MB`, 'error')
    setFiles(f => [...f, ...incoming.filter(x => x.size <= MAX_FILE)].slice(0, 10))
  }

  async function send() {
    if (sending || (!text.trim() && !files.length)) return
    setSending(true)
    try {
      await api.send(convoId, mentionsToRaw(text, members), { parentId, subject: showSubject ? subject : undefined, files })
      setText(''); setSubject(''); setShowSubject(false); setFiles([])
      onSent?.()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSending(false)
      area.current?.focus()
    }
  }

  return (
    <div className="composer-wrap"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}>
      {dragging && <div className="drop-hint">Drop files to attach</div>}
      {mention && candidates.length > 0 && (
        <div className="popup mention-pop" role="listbox">
          {candidates.map((c, i) => (
            <button key={c.id} className={`pick-row${i === mentionIdx ? ' picked' : ''}`} role="option" aria-selected={i === mentionIdx}
              onMouseDown={e => { e.preventDefault(); insertMention(c) }}>
              {c.user ? <Avatar user={c.user} size={24} /> : <AtSign size={18} />}<span>{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        {showSubject && <input className="subject" placeholder="Add a subject" value={subject} maxLength={150} onChange={e => setSubject(e.target.value)} />}
        <textarea
          ref={area} rows={1} value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={e => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={e => {
            if (mention && candidates.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % candidates.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => (i - 1 + candidates.length) % candidates.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(candidates[mentionIdx]); return }
              if (e.key === 'Escape') { setMention(null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
          }}
          onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files) } }}
        />
        {files.length > 0 && (
          <div className="pending-files">
            {files.map((f, i) => (
              <span className="chip" key={i}><span>{f.name} · {formatBytes(f.size)}</span>
                <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><X size={13} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="bar">
          {allowSubject && <button className={`icon-btn${showSubject ? ' active' : ''}`} title="Add a subject" onClick={() => setShowSubject(s => !s)}><Type size={17} /></button>}
          <div ref={emojiRef} style={{ position: 'relative' }}>
            <button className="icon-btn" title="Emoji" onClick={() => setEmoji(e => !e)}><Smile size={17} /></button>
            {emoji && (
              <div className="popup" style={{ bottom: '100%', left: 0, marginBottom: 6 }}>
                <div className="emoji-grid">{EMOJIS.map(e => <button key={e} onClick={() => { setText(t => t + e); area.current?.focus() }}>{e}</button>)}</div>
              </div>
            )}
          </div>
          <button className="icon-btn" title="Attach files" onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button>
          <input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
          <div className="grow" />
          <button className="btn primary sm" disabled={sending || (!text.trim() && !files.length)} onClick={send} aria-label="Send"><Send size={15} /></button>
        </div>
      </div>
    </div>
  )
}
