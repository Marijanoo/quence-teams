import { create } from 'zustand'
import { api, ApiError, getToken, setToken } from './api'
import { socket } from './socket'
import type { CallLog, Chat, Meeting, Message, Presence, QuickView, Selection, Team, User, View } from './types'

interface ConvoCache { messages: Message[]; hasMore: boolean; loaded: boolean }
export interface Draft { text: string; at: number }
export interface Toast { id: number; text: string; kind?: 'error' | 'info' }
export interface IncomingCall { room: string; convoId: string; from: User }
export interface ActiveCall { room: string; title: string }
export interface ConfirmState { title: string; message?: string; confirmLabel: string; danger?: boolean; resolve: (ok: boolean) => void }

interface State {
  me: User | null
  presencePref: Presence
  users: Record<string, User>
  presence: Record<string, Presence>
  teams: Team[]
  chats: Chat[]
  activityUnseen: number
  meetings: Meeting[]
  callHistory: CallLog[]
  favorites: string[]
  savedIds: string[]
  drafts: Record<string, Draft>
  quickView: QuickView | null
  ready: boolean
  online: boolean

  view: View
  selection: Selection | null
  threadId: string | null
  jumpTo: string | null
  convos: Record<string, ConvoCache>
  threads: Record<string, Message[]>
  typing: Record<string, Record<string, number>>

  calls: Record<string, string[]>
  incoming: IncomingCall | null
  activeCall: ActiveCall | null
  toasts: Toast[]
  confirmState: ConfirmState | null

  signIn: (token: string, user: User) => Promise<void>
  signOut: () => void
  bootstrap: () => Promise<void>
  refreshTeams: () => Promise<void>
  setView: (v: View) => void
  setQuick: (q: QuickView | null) => void
  toggleFavorite: (convoId: string) => Promise<void>
  toggleSaved: (messageId: string) => Promise<void>
  sendMessage: (convoId: string, body: string, opts?: { parentId?: string; subject?: string; files?: File[]; replyTo?: Message | null }) => Promise<boolean>
  setDraft: (key: string, text: string) => void
  select: (s: Selection | null) => Promise<void>
  goTo: (convoId: string, messageId?: string, threadId?: string) => Promise<void>
  openThread: (id: string | null) => Promise<void>
  loadMore: (convoId: string) => Promise<void>
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  joinCall: (room: string, title: string) => void
  leaveCall: () => void
  dismissIncoming: () => void
}

let toastId = 1

function upsert(list: Message[], msg: Message): Message[] {
  const i = list.findIndex(m => m.id === msg.id)
  if (i >= 0) { const copy = list.slice(); copy[i] = msg; return copy }
  return [...list, msg].sort((a, b) => a.seq - b.seq)
}

const isPending = (m: Message) => m.id.startsWith('pending-')

// Adds or removes a not-yet-confirmed message in the conversation list or thread it belongs to.
function withLocal(st: State, msg: Message, change: (list: Message[]) => Message[]): Partial<State> {
  if (msg.parentId) {
    return st.threads[msg.parentId] ? { threads: { ...st.threads, [msg.parentId]: change(st.threads[msg.parentId]) } } : {}
  }
  const c = st.convos[msg.convoId]
  return c ? { convos: { ...st.convos, [msg.convoId]: { ...c, messages: change(c.messages) } } } : {}
}

export function convoName(s: State, convoId: string): string {
  for (const t of s.teams) {
    const c = t.channels.find(c => c.id === convoId)
    if (c) return `${t.name} › ${c.name}`
  }
  const chat = s.chats.find(c => c.id === convoId)
  return chat ? chatTitle(chat, s.me?.id) : 'Conversation'
}

export function chatTitle(chat: Chat, meId?: string): string {
  if (chat.title) return chat.title
  const others = chat.members.filter(m => m.id !== meId)
  return others.map(m => m.name).join(', ') || 'Just you'
}

function isViewing(convoId: string) {
  const { selection, view } = useStore.getState()
  return !!selection && selection.convoId === convoId && view === 'chat' && !useStore.getState().quickView && document.hasFocus()
}

function bump(s: State, msg: Message, mine: boolean): Partial<State> {
  const mentionsMe = !!s.me && msg.body.includes(`<@${s.me.id}>`) || msg.body.includes('<@everyone>')
  const unread = mine || isViewing(msg.convoId) || msg.parentId ? 0 : 1
  const men = unread && mentionsMe ? 1 : 0
  const chats = s.chats.map(c => c.id === msg.convoId && !msg.parentId
    ? {
        ...c, unread: c.unread + unread, mentions: c.mentions + men, lastActivity: msg.createdAt,
        lastMessage: { body: msg.body, kind: msg.kind, authorId: msg.author?.id, createdAt: msg.createdAt }
      }
    : c).sort((a, b) => b.lastActivity - a.lastActivity)
  const teams = s.teams.map(t => ({
    ...t,
    channels: t.channels.map(c => c.id === msg.convoId ? { ...c, unread: c.unread + unread, mentions: c.mentions + men } : c)
  }))
  return { chats, teams }
}

export const useStore = create<State>((set, get) => ({
  me: null, presencePref: 'available', users: {}, presence: {}, teams: [], chats: [], activityUnseen: 0, meetings: [], callHistory: [], favorites: [], savedIds: [], drafts: {}, quickView: null,
  ready: false, online: false,
  view: 'chat', selection: null, threadId: null, jumpTo: null, convos: {}, threads: {}, typing: {},
  calls: {}, incoming: null, activeCall: null, toasts: [], confirmState: null,

  async signIn(token, user) {
    setToken(token)
    set({ me: user, drafts: loadDrafts(user.id) })
    await get().bootstrap()
    wireSocket()
    socket.connect()
  },

  signOut() {
    socket.disconnect()
    setToken(null)
    set({
      me: null, ready: false, teams: [], chats: [], users: {}, presence: {}, convos: {}, threads: {}, selection: null,
      threadId: null, jumpTo: null, meetings: [], callHistory: [], favorites: [], savedIds: [], drafts: {}, quickView: null, activeCall: null, incoming: null, typing: {}, calls: {}
    })
  },

  async bootstrap() {
    const b = await api.bootstrap()
    set({
      me: b.me, presencePref: b.presencePref as Presence, users: Object.fromEntries(b.users.map(u => [u.id, u])),
      presence: b.presence as Record<string, Presence>, teams: b.teams, chats: b.chats, activityUnseen: b.activityUnseen, ready: true,
      favorites: b.favorites, savedIds: b.savedIds,
      drafts: Object.keys(get().drafts).length ? get().drafts : loadDrafts(b.me.id)
    })
  },

  async refreshTeams() {
    const b = await api.bootstrap()
    set({ teams: b.teams, users: Object.fromEntries(b.users.map(u => [u.id, u])) })
  },

  setView(view) { set({ view }) },
  setQuick(quickView) { set({ quickView, ...(quickView ? { selection: null, threadId: null } : {}) }) },

  async toggleFavorite(convoId) {
    const on = !get().favorites.includes(convoId)
    set(s => ({ favorites: on ? [...s.favorites, convoId] : s.favorites.filter(id => id !== convoId) }))
    try { await api.favorite(convoId, on) } catch (e) {
      set(s => ({ favorites: on ? s.favorites.filter(id => id !== convoId) : [...s.favorites, convoId] }))
      get().toast((e as Error).message, 'error')
    }
  },

  // Shows the message right away; the server's copy replaces it when it arrives. Messages with files wait for the upload.
  async sendMessage(convoId, body, opts = {}) {
    const me = get().me!
    const q = opts.replyTo
    const pending: Message = {
      id: 'pending-' + Math.random().toString(36).slice(2), seq: Number.MAX_SAFE_INTEGER, convoId, parentId: opts.parentId ?? null,
      replyTo: q ? { id: q.id, convoId: q.convoId, author: q.author, snippet: q.body.slice(0, 200), deleted: false, hasAttachment: q.attachments.length > 0 } : null,
      kind: 'text', subject: opts.subject ?? '', author: me, body, createdAt: Date.now(), editedAt: null, deleted: false, pinned: false,
      reactions: [], attachments: [], replyCount: 0, lastReplyAt: null
    }
    const optimistic = !opts.files?.length
    if (optimistic) set(st => withLocal(st, pending, list => [...list, pending]))
    try {
      const sent = await api.send(convoId, body, { parentId: opts.parentId, subject: opts.subject, files: opts.files, replyTo: opts.replyTo?.id })
      set(st => withLocal(st, pending, list => upsert(list.filter(m => m.id !== pending.id), sent)))
      return true
    } catch (e) {
      if (optimistic) set(st => withLocal(st, pending, list => list.filter(m => m.id !== pending.id)))
      get().toast((e as Error).message, 'error')
      return false
    }
  },

  async toggleSaved(messageId) {
    const on = !get().savedIds.includes(messageId)
    set(s => ({ savedIds: on ? [...s.savedIds, messageId] : s.savedIds.filter(id => id !== messageId) }))
    try { await api.save(messageId, on) } catch (e) {
      set(s => ({ savedIds: on ? s.savedIds.filter(id => id !== messageId) : [...s.savedIds, messageId] }))
      get().toast((e as Error).message, 'error')
    }
  },

  // Unsent text is kept per conversation (and per thread) and survives restarts.
  setDraft(key, text) {
    const me = get().me
    set(s => {
      const drafts = { ...s.drafts }
      if (text.trim()) drafts[key] = { text, at: Date.now() }; else delete drafts[key]
      if (me) { try { localStorage.setItem(`qt.drafts.${me.id}`, JSON.stringify(drafts)) } catch { /* storage unavailable */ } }
      return { drafts }
    })
  },

  async select(selection) {
    set({ selection, threadId: null, ...(selection ? { quickView: null } : {}) })
    if (!selection) return
    const id = selection.convoId
    if (!get().convos[id]?.loaded) {
      try {
        const { messages, hasMore } = await api.messages(id)
        set(s => ({ convos: { ...s.convos, [id]: { messages, hasMore, loaded: true } } }))
      } catch (e) {
        get().toast((e as Error).message, 'error')
        return
      }
    }
    if (get().selection?.convoId === id) {
      api.markRead(id).catch(() => {})
      set(s => ({
        chats: s.chats.map(c => c.id === id ? { ...c, unread: 0, mentions: 0 } : c),
        teams: s.teams.map(t => ({ ...t, channels: t.channels.map(c => c.id === id ? { ...c, unread: 0, mentions: 0 } : c) }))
      }))
    }
  },

  async goTo(convoId, messageId, threadId) {
    const st = get()
    let selection: Selection | null = null
    const view: View = 'chat'
    for (const t of st.teams) {
      if (t.channels.some(c => c.id === convoId)) selection = { convoId, kind: 'channel', teamId: t.id }
    }
    if (!selection && st.chats.some(c => c.id === convoId)) selection = { convoId, kind: 'chat' }
    if (!selection) return
    set({ view, quickView: null })
    await get().select(selection)
    if (threadId) await get().openThread(threadId)
    if (messageId) {
      // Make sure the message is in the loaded window; otherwise load older pages until it is (bounded).
      for (let i = 0; i < 5 && !get().convos[convoId]?.messages.some(m => m.id === (threadId ?? messageId)); i++) {
        if (!get().convos[convoId]?.hasMore) break
        await get().loadMore(convoId)
      }
      set({ jumpTo: messageId })
      setTimeout(() => { if (get().jumpTo === messageId) set({ jumpTo: null }) }, 2500)
    }
  },

  async openThread(id) {
    set({ threadId: id })
    if (!id) return
    try {
      const sel = get().selection
      if (!sel) return
      const { messages } = await api.messages(sel.convoId, { parent: id })
      set(s => ({ threads: { ...s.threads, [id]: messages } }))
    } catch (e) {
      get().toast((e as Error).message, 'error')
    }
  },

  async loadMore(convoId) {
    const cache = get().convos[convoId]
    if (!cache?.hasMore || !cache.messages.length) return
    const { messages, hasMore } = await api.messages(convoId, { before: cache.messages[0].seq })
    set(s => ({ convos: { ...s.convos, [convoId]: { messages: [...messages, ...s.convos[convoId].messages], hasMore, loaded: true } } }))
  },

  toast(text, kind = 'info') {
    const id = toastId++
    set(s => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 5000)
  },
  dismissToast(id) { set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })) },

  joinCall(room, title) { set({ activeCall: { room, title }, incoming: null }) },
  leaveCall() { set({ activeCall: null }) },
  dismissIncoming() { set({ incoming: null }) }
}))

let wired = false
function wireSocket() {
  if (wired) return
  wired = true
  const set = useStore.setState
  const get = useStore.getState

  socket.onStatus = connected => {
    set({ online: connected })
    // After a reconnect, anything may have changed while we were away.
    if (connected && get().ready) {
      get().refreshTeams().catch(() => {})
      api.bootstrap().then(b => set({ chats: b.chats, activityUnseen: b.activityUnseen })).catch(() => {})
      const sel = get().selection
      if (sel) api.messages(sel.convoId).then(r => set(s => ({ convos: { ...s.convos, [sel.convoId]: { messages: r.messages, hasMore: r.hasMore, loaded: true } } }))).catch(() => {})
    }
  }

  socket.on('hello', d => set({ presence: d.presence, calls: d.calls }))
  socket.on('presence', d => set(s => ({ presence: { ...s.presence, [d.userId]: d.presence } })))
  socket.on('user.updated', u => set(s => ({ users: { ...s.users, [u.id]: u }, me: s.me?.id === u.id ? u : s.me })))
  socket.on('call.state', d => set(s => {
    const calls = { ...s.calls }
    if (d.participants.length) calls[d.room] = d.participants
    else delete calls[d.room]
    return { calls }
  }))

  socket.on('message.new', (msg: Message) => {
    const s = get()
    const mine = msg.author?.id === s.me?.id
    if (mine) set(st => withLocal(st, msg, list => {
      const i = list.findIndex(m => isPending(m) && m.body === msg.body)
      return i < 0 ? list : list.filter((_, j) => j !== i)
    }))
    if (msg.parentId) {
      set(st => ({
        threads: st.threads[msg.parentId!] ? { ...st.threads, [msg.parentId!]: upsert(st.threads[msg.parentId!], msg) } : st.threads,
        convos: bumpReply(st.convos, msg)
      }))
    } else {
      set(st => ({
        convos: st.convos[msg.convoId]
          ? { ...st.convos, [msg.convoId]: { ...st.convos[msg.convoId], messages: upsert(st.convos[msg.convoId].messages, msg) } }
          : st.convos
      }))
    }
    set(st => bump(st, msg, mine))
    if (!mine) {
      if (isViewing(msg.convoId)) api.markRead(msg.convoId).catch(() => {})
      else notify(msg)
      set(st => ({ typing: clearTyping(st.typing, msg.convoId, msg.author?.id) }))
    }
  })

  socket.on('message.updated', (msg: Message) => {
    set(st => ({
      convos: st.convos[msg.convoId]
        ? { ...st.convos, [msg.convoId]: { ...st.convos[msg.convoId], messages: st.convos[msg.convoId].messages.map(m => m.id === msg.id ? msg : m) } }
        : st.convos,
      threads: msg.parentId && st.threads[msg.parentId]
        ? { ...st.threads, [msg.parentId]: st.threads[msg.parentId].map(m => m.id === msg.id ? msg : m) }
        : st.threads
    }))
  })

  socket.on('chat.new', (chat: Chat) => set(st => ({ chats: st.chats.some(c => c.id === chat.id) ? st.chats : [chat, ...st.chats] })))
  socket.on('chat.updated', (chat: Chat) => set(st => ({ chats: st.chats.map(c => c.id === chat.id ? chat : c) })))
  socket.on('chat.removed', ({ chatId }) => {
    set(st => ({ chats: st.chats.filter(c => c.id !== chatId) }))
    if (get().selection?.convoId === chatId) get().select(null)
  })
  socket.on('team.updated', () => { get().refreshTeams().catch(() => {}) })
  socket.on('team.removed', ({ teamId }) => {
    set(st => ({ teams: st.teams.filter(t => t.id !== teamId) }))
    const sel = get().selection
    if (sel?.teamId === teamId) get().select(null)
  })

  socket.on('typing', d => {
    const until = Date.now() + 5000
    set(st => ({ typing: { ...st.typing, [d.convoId]: { ...st.typing[d.convoId], [d.user.id]: until } } }))
  })

  socket.on('meeting.updated', (m: Meeting) => set(st => ({ meetings: [...st.meetings.filter(x => x.id !== m.id), m].sort((a, b) => a.startsAt - b.startsAt) })))
  socket.on('meeting.removed', ({ id }) => set(st => ({ meetings: st.meetings.filter(m => m.id !== id) })))

  socket.on('call.incoming', (c: IncomingCall) => {
    if (get().activeCall) return
    set({ incoming: c })
  })
  socket.on('call.declined', () => {})
  socket.on('call.history', () => { api.callHistory().then(callHistory => set({ callHistory })).catch(() => {}) })

  // Typing indicators expire on their own.
  setInterval(() => {
    const t = Date.now()
    const typing = get().typing
    let changed = false
    const next: typeof typing = {}
    for (const [convo, users] of Object.entries(typing)) {
      const alive = Object.fromEntries(Object.entries(users).filter(([, until]) => until > t))
      if (Object.keys(alive).length !== Object.keys(users).length) changed = true
      if (Object.keys(alive).length) next[convo] = alive
    }
    if (changed) set({ typing: next })
  }, 1000)
}

function bumpReply(convos: State['convos'], msg: Message) {
  const cache = convos[msg.convoId]
  if (!cache) return convos
  return {
    ...convos,
    [msg.convoId]: {
      ...cache,
      messages: cache.messages.map(m => m.id === msg.parentId ? { ...m, replyCount: m.replyCount + 1, lastReplyAt: msg.createdAt } : m)
    }
  }
}

function clearTyping(typing: State['typing'], convoId: string, userId?: string) {
  if (!userId || !typing[convoId]?.[userId]) return typing
  const { [userId]: _gone, ...rest } = typing[convoId]
  return { ...typing, [convoId]: rest }
}

function notify(msg: Message) {
  const s = useStore.getState()
  if (s.presencePref === 'dnd') return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const text = msg.body.replace(/<@([0-9a-f-]{36}|everyone)>/g, (_m, id) => id === 'everyone' ? '@everyone' : `@${s.users[id]?.name ?? 'someone'}`)
  const n = new Notification(`${msg.author?.name ?? 'Someone'} · ${convoName(s, msg.convoId)}`, { body: msg.kind === 'call' ? 'Started a meeting' : text || 'Sent a file', silent: false })
  n.onclick = () => { window.focus(); n.close() }
}

export async function restoreSession(): Promise<void> {
  if (!getToken()) return
  try {
    await useStore.getState().bootstrap()
    wireSocket()
    socket.connect()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setToken(null)
    else throw e
  }
}

// Themed confirmation popup (replaces window.confirm, which looks out of place in the desktop app).
export function askConfirm(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    useStore.setState({ confirmState: { title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'Confirm', danger: opts.danger, resolve } })
  })
}

function loadDrafts(userId: string): Record<string, Draft> {
  try { return JSON.parse(localStorage.getItem(`qt.drafts.${userId}`) ?? '{}') } catch { return {} }
}
