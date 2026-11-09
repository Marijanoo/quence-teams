import { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, BarChart3, CalendarClock, Mic, Paperclip, Send, Smile, Square, X, Type } from 'lucide-react'
import { formatBytes, laterTimes, mentionsToRaw, plainText } from '../lib/format'
import { api } from '../lib/api'
import { EmojiGrid, EmojiManager } from './CustomEmoji'
import { GifPicker } from './GifPicker'
import { useStore } from '../lib/store'
import { socket } from '../lib/socket'
import { audioConstraints, getSettings, useSettings } from '../lib/settings'
import type { Message, User } from '../lib/types'
import { Avatar, useClickOutside } from './ui'
import { PollDialog } from './PollDialog'

const MAX_FILE = 25 * 1024 * 1024

// Typed commands. The text after the command is passed on as the argument.
const COMMANDS = [
  { name: 'poll', hint: 'Question | Option 1 | Option 2', help: 'Ask the room to vote' },
  { name: 'shrug', hint: 'message', help: 'Add ¯\\_(ツ)_/¯ to a message' },
  { name: 'me', hint: 'does something', help: 'Say something about yourself in italics' }
]

interface ComposerProps {
  convoId: string; parentId?: string; placeholder: string; allowSubject?: boolean; onSent?: () => void; members: User[]
  quote?: Message | null; onClearQuote?: () => void
}

// Re-created per conversation/thread so each one starts from its own saved draft.
export function Composer(props: ComposerProps) {
  return <ComposerInner key={props.parentId ? `${props.convoId}#${props.parentId}` : props.convoId} {...props} />
}

function ComposerInner({ convoId, parentId, placeholder, allowSubject, onSent, members, quote, onClearQuote }: ComposerProps) {
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const users = useStore(s => s.users)
  const cfg = useSettings()
  const [text, setText] = useState(() => useStore.getState().drafts[parentId ? `${convoId}#${parentId}` : convoId]?.text ?? '')
  const [subject, setSubject] = useState('')
  const [showSubject, setShowSubject] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [poll, setPoll] = useState<{ question: string; options?: string[] } | null>(null)
  const [slashIdx, setSlashIdx] = useState(0)
  const [manageEmoji, setManageEmoji] = useState(false)
  const [gif, setGif] = useState(false)
  const [later, setLater] = useState(false)
  const [custom, setCustom] = useState('')
  const [rec, setRec] = useState<{ recorder: MediaRecorder; started: number } | null>(null)
  const [recSecs, setRecSecs] = useState(0)
  const gifRef = useClickOutside<HTMLDivElement>(() => setGif(false), gif)
  const laterRef = useClickOutside<HTMLDivElement>(() => setLater(false), later)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastTyping = useRef(0)
  const emojiRef = useClickOutside<HTMLDivElement>(() => setEmoji(false), emoji)

  // Drafts survive switching conversations and restarting the app.
  const draftKey = parentId ? `${convoId}#${parentId}` : convoId
  const setDraft = useStore(s => s.setDraft)
  useEffect(() => { setDraft(draftKey, text) }, [text, draftKey, setDraft])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [text])

  useEffect(() => { if (quote) area.current?.focus() }, [quote])

  const candidates = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    const list: { id: string; name: string; user?: User }[] = members.filter(u => u.id !== me.id && u.name.toLowerCase().includes(q)).map(u => ({ id: u.id, name: u.name, user: u }))
    if (members.length > 2 && 'everyone'.startsWith(q)) list.unshift({ id: 'everyone', name: 'everyone' })
    return list.slice(0, 6)
  }, [mention, members, me.id])

  const slash = /^\/([a-z]*)$/.exec(text)
  const commandHints = slash ? COMMANDS.filter(c => c.name.startsWith(slash[1])) : []

  function pickCommand(name: string) {
    setText(`/${name} `)
    setSlashIdx(0)
    requestAnimationFrame(() => area.current?.focus())
  }

  function onChange(value: string, caret: number) {
    setText(value)
    setSlashIdx(0)
    const before = value.slice(0, caret)
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before)
    setMention(m ? { start: caret - m[2].length - 1, query: m[2] } : null)
    setMentionIdx(0)
    if (value && getSettings().sendTyping && Date.now() - lastTyping.current > 3000) {
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

  // Voice messages are recorded here and attached like any file, so they can be listened to before sending.
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setRec(null)
        if (!chunks.length || (recorder as MediaRecorder & { cancelled?: boolean }).cancelled) return
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        addFiles([new File([blob], `Voice message ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}.webm`, { type: blob.type.split(';')[0] })])
      }
      recorder.start()
      setRec({ recorder, started: Date.now() })
    } catch { toast('Could not use the microphone. Check that Quence Teams is allowed to use it.', 'error') }
  }
  function stopRecording(cancel = false) {
    if (!rec) return
    if (cancel) (rec.recorder as MediaRecorder & { cancelled?: boolean }).cancelled = true
    if (rec.recorder.state !== 'inactive') rec.recorder.stop()
  }
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => { const s = Math.floor((Date.now() - rec.started) / 1000); setRecSecs(s); if (s >= 300) stopRecording() }, 500)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec])
  useEffect(() => () => { if (rec?.recorder.state === 'recording') stopRecording(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function scheduleAt(at: number) {
    const body = mentionsToRaw(text, members)
    if (!body.trim()) return toast('Write the message first, then pick when to send it', 'error')
    if (files.length) return toast('Scheduled messages cannot have files yet', 'error')
    try {
      await api.schedule({ convoId, parentId, body, sendAt: at })
      setText(''); setLater(false); onClearQuote?.()
      toast(`Scheduled for ${new Date(at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`, 'info')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  async function sendGif(g: { url: string; title: string }) {
    setGif(false)
    try { await api.sendGif(convoId, { url: g.url, title: g.title, parentId }); onSent?.() } catch (e) { toast((e as Error).message, 'error') }
  }

  async function send() {
    if (sending || (!text.trim() && !files.length)) return
    let outgoing = text
    const cmd = /^\/(poll|shrug|me)(?:\s+([\s\S]*))?$/.exec(text.trim())
    if (cmd) {
      const arg = (cmd[2] ?? '').trim()
      if (cmd[1] === 'poll') {
        const [question, ...options] = arg.split('|').map(x => x.trim())
        setText(''); setPoll({ question: question ?? '', options: options.filter(Boolean).length ? options.filter(Boolean) : undefined })
        return
      }
      if (cmd[1] === 'shrug') outgoing = `${arg ? arg + ' ' : ''}¯\\_(ツ)_/¯`
      else if (arg) outgoing = `*${me.name} ${arg.replace(/\*/g, '')}*`
      else return
    }
    const draft = { text: outgoing, subject, showSubject, files, quote }
    const hasFiles = files.length > 0
    // Clear right away so the box is ready for the next message; put everything back if the send fails.
    setText(''); setSubject(''); setShowSubject(false); setFiles([])
    onClearQuote?.()
    onSent?.()
    if (hasFiles) setSending(true)
    const ok = await useStore.getState().sendMessage(convoId, mentionsToRaw(draft.text, members), {
      parentId, subject: draft.showSubject ? draft.subject : undefined, files: draft.files, replyTo: draft.quote
    })
    if (!ok) {
      setText(t => t || draft.text); setSubject(draft.subject); setShowSubject(draft.showSubject); setFiles(f => f.length ? f : draft.files)
    }
    setSending(false)
    area.current?.focus()
  }

  return (
    <div className="composer-wrap"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}>
      {dragging && <div className="drop-hint">Drop files to attach</div>}
      {manageEmoji && <EmojiManager onClose={() => setManageEmoji(false)} />}
      {poll && <PollDialog convoId={convoId} parentId={parentId} initialQuestion={poll.question} initialOptions={poll.options} onClose={() => setPoll(null)} />}
      {commandHints.length > 0 && !mention && (
        <div className="popup mention-pop" role="listbox" aria-label="Commands">
          {commandHints.map((c, i) => (
            <button key={c.name} className={`pick-row${i === slashIdx ? ' picked' : ''}`} role="option" aria-selected={i === slashIdx}
              onMouseDown={e => { e.preventDefault(); pickCommand(c.name) }}>
              <strong>/{c.name}</strong><span className="slash-hint">{c.help}</span>
            </button>
          ))}
        </div>
      )}
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
      {quote && (
        <div className="reply-bar">
          <div className="who">
            <span className="quote-author">Replying to {quote.author?.name ?? 'message'}</span>
            <span className="quote-text">{plainText(quote.body, users) || (quote.attachments.length ? 'Attachment' : '')}</span>
          </div>
          <button className="icon-btn" aria-label="Cancel reply" onClick={onClearQuote}><X size={16} /></button>
        </div>
      )}
      <div className="composer">
        {showSubject && <input className="subject" placeholder="Add a subject" value={subject} maxLength={150} onChange={e => setSubject(e.target.value)} />}
        <textarea
          ref={area} rows={1} value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck={cfg.spellcheck}
          onChange={e => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={e => {
            if (commandHints.length && !mention) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % commandHints.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + commandHints.length) % commandHints.length); return }
              if ((e.key === 'Tab' || e.key === 'Enter') && text !== `/${commandHints[slashIdx].name}`) { e.preventDefault(); pickCommand(commandHints[slashIdx].name); return }
              if (e.key === 'Tab') { e.preventDefault(); pickCommand(commandHints[slashIdx].name); return }
            }
            if (mention && candidates.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % candidates.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => (i - 1 + candidates.length) % candidates.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(candidates[mentionIdx]); return }
              if (e.key === 'Escape') { setMention(null); return }
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && (cfg.enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() }
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
                <EmojiGrid onPick={e => { setText(t => t + e); area.current?.focus() }} onManage={() => { setEmoji(false); setManageEmoji(true) }} />
              </div>
            )}
          </div>
          <div ref={gifRef} style={{ position: 'relative' }}>
            <button className={`icon-btn gif-btn${gif ? ' active' : ''}`} title="Send a GIF" aria-label="Send a GIF" onClick={() => setGif(g => !g)}>GIF</button>
            {gif && <div className="popup" style={{ bottom: '100%', left: 0, marginBottom: 6 }}><GifPicker onPick={g => void sendGif(g)} /></div>}
          </div>
          <button className="icon-btn" title="Create a poll" onClick={() => setPoll({ question: '' })}><BarChart3 size={17} /></button>
          <button className="icon-btn" title="Attach files" onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button>
          {rec
            ? <><span className="rec-dot" />{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}
                <button className="icon-btn" title="Stop and attach" aria-label="Stop recording" onClick={() => stopRecording()}><Square size={15} /></button>
                <button className="icon-btn" title="Discard" aria-label="Discard recording" onClick={() => stopRecording(true)}><X size={15} /></button></>
            : <button className="icon-btn" title="Record a voice message" aria-label="Record a voice message" onClick={() => void startRecording()}><Mic size={17} /></button>}
          <input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
          <div className="grow" />
          <div ref={laterRef} style={{ position: 'relative' }}>
            <button className="icon-btn" title="Schedule send" aria-label="Schedule send" onClick={() => setLater(l => !l)}><CalendarClock size={17} /></button>
            {later && (
              <div className="menu" style={{ bottom: '100%', right: 0, marginBottom: 6, minWidth: 220 }} role="menu">
                {laterTimes().map(r => <button key={r.label} onClick={() => void scheduleAt(r.at)}>{r.label}</button>)}
                <hr />
                <div style={{ display: 'flex', gap: 6, padding: '4px 8px' }}>
                  <input className="input" type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} style={{ minWidth: 0 }} />
                  <button className="btn primary sm" disabled={!custom} onClick={() => void scheduleAt(new Date(custom).getTime())}>Set</button>
                </div>
              </div>
            )}
          </div>
          <button className="btn primary sm" disabled={sending || (!text.trim() && !files.length)} onClick={send} aria-label="Send"><Send size={15} /></button>
        </div>
      </div>
    </div>
  )
}
