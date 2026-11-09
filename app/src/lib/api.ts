import { isNative } from './platform'
import type { ActivityItem, CallLog, Channel, Chat, EditVersion, LinkCard, Meeting, Message, Reminder, Scheduled, SearchHit, Team, TeamDetail, User, Webhook } from './types'

const KEY_TOKEN = 'qt.token'

// On a website the API lives on the same origin. In the desktop and Android apps the page is served locally, so they
// always talk to teams.kolaj.fun.
export function defaultServer(): string {
  return location.protocol.startsWith('http') && !isNative ? '' : 'https://teams.kolaj.fun'
}
export const getServer = () => defaultServer()
export const getToken = () => localStorage.getItem(KEY_TOKEN)
export const setToken = (t: string | null) => (t ? localStorage.setItem(KEY_TOKEN, t) : localStorage.removeItem(KEY_TOKEN))

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }

  let res: Response
  try {
    res = await fetch(getServer() + path, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection or the server address.')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/api/auth/')) onUnauthorized()
    throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`)
  }
  return json as T
}

export const fileUrl = (id: string, download = false) =>
  `${getServer()}/api/files/${id}?token=${encodeURIComponent(getToken() ?? '')}${download ? '&download=1' : ''}`

export const avatarUrl = (id: string, version: number) =>
  `${getServer()}/api/users/${id}/avatar?v=${version}&token=${encodeURIComponent(getToken() ?? '')}`

export const emojiUrl = (name: string) => `${getServer()}/api/emoji/${name}?token=${encodeURIComponent(getToken() ?? '')}`

export interface Bootstrap {
  me: User; presencePref: string; users: User[]; teams: Team[]; chats: Chat[]
  presence: Record<string, string>; activityUnseen: number; favorites: string[]; savedIds: string[]; muted?: string[]
}

export const api = {
  login: (email: string, password: string) => request<{ token: string; user: User }>('POST', '/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => request<{ token: string; user: User }>('POST', '/api/auth/register', { name, email, password }),
  iceServers: () => request<{ iceServers: RTCIceServer[] }>('GET', '/api/ice'),
  bootstrap: () => request<Bootstrap>('GET', '/api/bootstrap'),
  uploadAvatar: (file: Blob) => { const f = new FormData(); f.set('file', file, 'avatar'); return request<User>('POST', '/api/me/avatar', f) },
  removeAvatar: () => request<User>('DELETE', '/api/me/avatar'),
  updateMe: (patch: { title?: string; statusMsg?: string; presence?: string; oooUntil?: number | null; oooMsg?: string }) => request<User>('PATCH', '/api/me', patch),

  createTeam: (name: string, description = '') => request<Team>('POST', '/api/teams', { name, description }),
  team: (id: string) => request<TeamDetail>('GET', `/api/teams/${id}`),
  deleteTeam: (id: string) => request('DELETE', `/api/teams/${id}`),
  addTeamMember: (id: string, email: string) => request('POST', `/api/teams/${id}/members`, { email }),
  removeTeamMember: (id: string, userId: string) => request('DELETE', `/api/teams/${id}/members/${userId}`),
  setTeamRole: (id: string, userId: string, role: 'owner' | 'member') => request('PATCH', `/api/teams/${id}/members/${userId}`, { role }),
  createChannel: (teamId: string, name: string, isPrivate: boolean, description = '') =>
    request<Channel>('POST', `/api/teams/${teamId}/channels`, { name, isPrivate, description }),
  setChannelPosting: (id: string, posting: 'all' | 'owners') => request('PATCH', `/api/channels/${id}`, { posting }),
  deleteChannel: (id: string) => request('DELETE', `/api/channels/${id}`),
  addChannelMember: (id: string, userId: string) => request('POST', `/api/channels/${id}/members`, { userId }),

  createChat: (userIds: string[], title = '') => request<Chat>('POST', '/api/chats', { userIds, title }),
  renameChat: (id: string, title: string) => request('PATCH', `/api/chats/${id}`, { title }),
  addChatMember: (id: string, userId: string) => request('POST', `/api/chats/${id}/members`, { userId }),
  leaveChat: (id: string) => request('DELETE', `/api/chats/${id}/members/me`),

  messages: (convoId: string, opts: { before?: number; parent?: string } = {}) => {
    const q = new URLSearchParams()
    if (opts.before) q.set('before', String(opts.before))
    if (opts.parent) q.set('parent', opts.parent)
    return request<{ messages: Message[]; hasMore: boolean }>('GET', `/api/convos/${convoId}/messages?${q}`)
  },
  send: (convoId: string, body: string, opts: { parentId?: string; subject?: string; files?: File[]; replyTo?: string } = {}) => {
    const form = new FormData()
    form.set('body', body)
    if (opts.parentId) form.set('parentId', opts.parentId)
    if (opts.subject) form.set('subject', opts.subject)
    if (opts.replyTo) form.set('replyTo', opts.replyTo)
    for (const f of opts.files ?? []) form.append('files', f, f.name)
    return request<Message>('POST', `/api/convos/${convoId}/messages`, form)
  },
  meetNow: (convoId: string) => request<Message>('POST', `/api/convos/${convoId}/meet`),
  edit: (id: string, body: string) => request<Message>('PATCH', `/api/messages/${id}`, { body }),
  remove: (id: string) => request('DELETE', `/api/messages/${id}`),
  pin: (id: string, pinned: boolean) => request('PUT', `/api/messages/${id}/pin`, { pinned }),
  createPoll: (convoId: string, poll: { question: string; options: string[]; multi: boolean; parentId?: string }) =>
    request<Message>('POST', `/api/convos/${convoId}/polls`, poll),
  vote: (id: string, optionId: string) => request('PUT', `/api/messages/${id}/vote`, { optionId }),
  react: (id: string, emoji: string, on: boolean) => request(on ? 'PUT' : 'DELETE', `/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
  markRead: (convoId: string) => request('POST', `/api/convos/${convoId}/read`),
  pins: (convoId: string) => request<Message[]>('GET', `/api/convos/${convoId}/pins`),
  files: (convoId: string) => request<{ id: string; name: string; mime: string; size: number; createdAt: number; uploader: User }[]>('GET', `/api/convos/${convoId}/files`),

  activity: () => request<ActivityItem[]>('GET', '/api/activity'),
  activitySeen: () => request('POST', '/api/activity/seen'),
  search: (q: string) => request<SearchHit[]>('GET', `/api/search?q=${encodeURIComponent(q)}`),

  favorite: (convoId: string, on: boolean) => request(on ? 'PUT' : 'DELETE', `/api/favorites/${convoId}`),
  save: (id: string, on: boolean) => request(on ? 'PUT' : 'DELETE', `/api/messages/${id}/save`),
  saved: () => request<SearchHit[]>('GET', '/api/saved'),
  mentions: () => request<SearchHit[]>('GET', '/api/mentions'),
  gifs: (q: string) => request<{ id: string; title: string; preview: string; url: string; width: number; height: number }[]>('GET', `/api/gifs?q=${encodeURIComponent(q)}`),
  sendGif: (convoId: string, gif: { url: string; title: string; parentId?: string }) => request<Message>('POST', `/api/convos/${convoId}/gif`, gif),
  history: (id: string) => request<EditVersion[]>('GET', `/api/messages/${id}/history`),
  mute: (convoId: string, on: boolean) => request(on ? 'PUT' : 'DELETE', `/api/muted/${convoId}`),
  preview: (url: string) => request<LinkCard | null>('GET', `/api/preview?url=${encodeURIComponent(url)}`),
  scheduled: () => request<Scheduled[]>('GET', '/api/scheduled'),
  schedule: (s: { convoId: string; parentId?: string; body: string; sendAt: number }) => request<Scheduled>('POST', '/api/scheduled', s),
  cancelScheduled: (id: string) => request('DELETE', `/api/scheduled/${id}`),
  reminders: () => request<Reminder[]>('GET', '/api/reminders'),
  remind: (r: { messageId?: string; text?: string; remindAt: number }) => request<Reminder>('POST', '/api/reminders', r),
  cancelReminder: (id: string) => request('DELETE', `/api/reminders/${id}`),
  emoji: () => request<{ name: string; createdBy: string }[]>('GET', '/api/emoji'),
  addEmoji: (name: string, file: File) => { const f = new FormData(); f.set('name', name); f.set('file', file, file.name); return request('POST', '/api/emoji', f) },
  removeEmoji: (name: string) => request('DELETE', `/api/emoji/${name}`),
  webhooks: (channelId: string) => request<Webhook[]>('GET', `/api/channels/${channelId}/webhooks`),
  addWebhook: (channelId: string, name: string) => request<Webhook>('POST', `/api/channels/${channelId}/webhooks`, { name }),
  removeWebhook: (channelId: string, id: string) => request('DELETE', `/api/channels/${channelId}/webhooks/${id}`),
  freeBusy: (users: string[], from: number, to: number) => request<Record<string, [number, number][]>>('GET', `/api/freebusy?users=${users.join(',')}&from=${from}&to=${to}`),
  callHistory: () => request<CallLog[]>('GET', '/api/calls'),
  meetings: (from: number, to: number) => request<Meeting[]>('GET', `/api/meetings?from=${from}&to=${to}`),
  createMeeting: (m: { title: string; description?: string; startsAt: number; endsAt: number; attendeeIds: string[]; convoId?: string | null; recur?: string; recurUntil?: number | null }) =>
    request<Meeting>('POST', '/api/meetings', m),
  updateMeeting: (id: string, patch: { title?: string; description?: string; startsAt?: number; endsAt?: number; attendeeIds?: string[]; recur?: string; recurUntil?: number | null }) =>
    request<Meeting>('PATCH', `/api/meetings/${id}`, patch),
  respondMeeting: (id: string, response: string) => request<Meeting>('PUT', `/api/meetings/${id}/response`, { response }),
  deleteMeeting: (id: string) => request('DELETE', `/api/meetings/${id}`)
}
