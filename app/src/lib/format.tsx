import type { ReactNode } from 'react'
import type { User } from './types'
import { getSettings } from './settings'

const AVATAR_COLORS = ['#7cc4a4', '#8fb4ee', '#c9a0e8', '#ef8f8f', '#e8a56c', '#6fc7d4', '#a7c96a']
export const avatarColor = (u: Pick<User, 'color'> | undefined) => AVATAR_COLORS[(u?.color ?? 0) % AVATAR_COLORS.length]

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

let timeFmtKey = ''
let timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
function timeFormatter() {
  const h = getSettings().hour12
  if (h !== timeFmtKey) {
    timeFmtKey = h
    timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(h === 'auto' ? {} : { hour12: h === '12' }) })
  }
  return timeFmt
}
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export const formatTime = (t: number) => timeFormatter().format(t)
export const formatHour = (h: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', ...(getSettings().hour12 === 'auto' ? {} : { hour12: getSettings().hour12 === '12' }) }).format(new Date(2000, 0, 1, h))
export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

export function formatDay(t: number): string {
  const today = Date.now()
  if (sameDay(t, today)) return 'Today'
  if (sameDay(t, today - 86_400_000)) return 'Yesterday'
  return dayFmt.format(t)
}

export function formatShort(t: number): string {
  if (sameDay(t, Date.now())) return formatTime(t)
  return shortFmt.format(t)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Plain text version of a message body (mentions resolved), for previews and notifications.
export function plainText(body: string, users: Record<string, User>): string {
  return body.replace(/<@([0-9a-f-]{36}|everyone)>/g, (_m, id) => id === 'everyone' ? '@everyone' : `@${users[id]?.name ?? 'someone'}`)
}

// Small markdown subset rendered as React nodes (never as raw HTML, so message text cannot inject markup).
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(<@(?:[0-9a-f-]{36}|everyone)>)|(https?:\/\/[^\s<]+)/g

function renderInline(text: string, users: Record<string, User>, meId: string | undefined, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const tok = m[0]
    const key = `${keyBase}-${i++}`
    if (tok.startsWith('`')) out.push(<code key={key} className="md-code">{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('~~')) out.push(<s key={key}>{tok.slice(2, -2)}</s>)
    else if (tok.startsWith('*')) out.push(<em key={key}>{tok.slice(1, -1)}</em>)
    else if (tok.startsWith('<@')) {
      const id = tok.slice(2, -1)
      const name = id === 'everyone' ? 'everyone' : users[id]?.name ?? 'unknown'
      out.push(<span key={key} className={`mention${id === meId || id === 'everyone' ? ' mention-me' : ''}`}>@{name}</span>)
    } else {
      const url = tok.replace(/[.,;:!?)]+$/, '')
      out.push(<a key={key} href={url} target="_blank" rel="noopener noreferrer">{url}</a>)
      if (url.length < tok.length) out.push(tok.slice(url.length))
    }
    last = start + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function renderBody(body: string, users: Record<string, User>, meId?: string): ReactNode {
  const parts = body.split(/```/)
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      const code = part.replace(/^[a-z]*\n/, '').replace(/\n$/, '')
      return <pre key={idx} className="md-pre"><code>{code}</code></pre>
    }
    return (
      <span key={idx} className="md-text">
        {part.split('\n').map((line, li, arr) => (
          <span key={li}>
            {renderInline(line, users, meId, `${idx}-${li}`)}
            {li < arr.length - 1 ? <br /> : null}
          </span>
        ))}
      </span>
    )
  })
}

// The six reactions Teams offers on hover, then a bigger set for the picker and the composer.
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😠']
export const EMOJIS = [...QUICK_REACTIONS,
  '🎉', '🔥', '👀', '✅', '🙏', '💯', '🚀', '😀', '😁', '😅', '🤣', '😊', '😍', '😘', '😎', '🤔', '😴', '😭', '🙌', '👏', '💪', '🤝', '👌', '✌️',
  '🤞', '👋', '🤷', '🙈', '💔', '💙', '💚', '💛', '💜', '⭐', '✨', '🌈', '☕', '🍕', '🎂', '🎁', '📌', '📎', '💡', '⚠️', '❌', '✔️', '⏰', '📅', '💬']

// Mentions are stored as <@userId> tokens, but people type and edit them as @Name.
export function mentionsToDisplay(body: string, users: Record<string, User>): string {
  return body.replace(/<@([0-9a-f-]{36}|everyone)>/g, (_m, id) => id === 'everyone' ? '@everyone' : `@${users[id]?.name ?? 'user'}`)
}

export function mentionsToRaw(text: string, members: User[]): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const names = [...members].sort((a, b) => b.name.length - a.name.length)
  let out = text
  for (const u of names) out = out.replace(new RegExp(`@${esc(u.name)}(?![\\p{L}\\p{N}_])`, 'gu'), `<@${u.id}>`)
  return out.replace(/@everyone(?![\p{L}\p{N}_])/gu, '<@everyone>')
}

// How many emoji a message is made of when it has nothing else in it (1 to 4), or 0 for any other message.
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u
export function emojiOnlyCount(body: string): number {
  const text = body.trim()
  if (!text || !segmenter || text.length > 80) return 0
  let n = 0
  for (const { segment } of segmenter.segment(text)) {
    if (/^\s+$/.test(segment)) continue
    if (!EMOJI_ONLY.test(segment)) return 0
    if (++n > 4) return 0
  }
  return n
}
