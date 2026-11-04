import type { ActivityItem, Channel, Chat, Meeting, Message, SearchHit, Team, TeamDetail, User } from './types'

const KEY_TOKEN = 'qt.token'
const KEY_SERVER = 'qt.server'

// On a website the API lives on the same origin. In Electron (file://) the user points the app at a server.
export function defaultServer(): string {
  return location.protocol.startsWith('http') ? '' : 'https://teams.kolaj.fun'
}
export const getServer = () => (localStorage.getItem(KEY_SERVER) ?? defaultServer()).replace(/\/+$/, '')
export const setServer = (url: string) => localStorage.setItem(KEY_SERVER, url.trim())
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

export interface Bootstrap {
  me: User; presencePref: string; users: User[]; teams: Team[]; chats: Chat[]
  presence: Record<string, string>; activityUnseen: number
}

export const api = {
  login: (email: string, password: string) => request<{ token: string; user: User }>('POST', '/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => request<{ token: string; user: User }>('POST', '/api/auth/register', { name, email, password }),
  bootstrap: () => request<Bootstrap>('GET', '/api/bootstrap'),
  updateMe: (patch: { title?: string; statusMsg?: string; presence?: string }) => request<User>('PATCH', '/api/me', patch),

  createTeam: (name: string, description = '') => request<Team>('POST', '/api/teams', { name, description }),
  team: (id: string) => request<TeamDetail>('GET', `/api/teams/${id}`),
  deleteTeam: (id: string) => request('DELETE', `/api/teams/${id}`),
  addTeamMember: (id: string, email: string) => request('POST', `/api/teams/${id}/members`, { email }),
  removeTeamMember: (id: string, userId: string) => request('DELETE', `/api/teams/${id}/members/${userId}`),
  setTeamRole: (id: string, userId: string, role: 'owner' | 'member') => request('PATCH', `/api/teams/${id}/members/${userId}`, { role }),
  createChannel: (teamId: string, name: string, isPrivate: boolean, description = '') =>
    request<Channel>('POST', `/api/teams/${teamId}/channels`, { name, isPrivate, description }),
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
  send: (convoId: string, body: string, opts: { parentId?: string; subject?: string; files?: File[] } = {}) => {
    const form = new FormData()
    form.set('body', body)
    if (opts.parentId) form.set('parentId', opts.parentId)
    if (opts.subject) form.set('subject', opts.subject)
    for (const f of opts.files ?? []) form.append('files', f, f.name)
    return request<Message>('POST', `/api/convos/${convoId}/messages`, form)
  },
  meetNow: (convoId: string) => request<Message>('POST', `/api/convos/${convoId}/meet`),
  edit: (id: string, body: string) => request<Message>('PATCH', `/api/messages/${id}`, { body }),
  remove: (id: string) => request('DELETE', `/api/messages/${id}`),
  pin: (id: string, pinned: boolean) => request('PUT', `/api/messages/${id}/pin`, { pinned }),
  react: (id: string, emoji: string, on: boolean) => request(on ? 'PUT' : 'DELETE', `/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
  markRead: (convoId: string) => request('POST', `/api/convos/${convoId}/read`),
  pins: (convoId: string) => request<Message[]>('GET', `/api/convos/${convoId}/pins`),
  files: (convoId: string) => request<{ id: string; name: string; mime: string; size: number; createdAt: number; uploader: User }[]>('GET', `/api/convos/${convoId}/files`),

  activity: () => request<ActivityItem[]>('GET', '/api/activity'),
  activitySeen: () => request('POST', '/api/activity/seen'),
  search: (q: string) => request<SearchHit[]>('GET', `/api/search?q=${encodeURIComponent(q)}`),

  meetings: (from: number, to: number) => request<Meeting[]>('GET', `/api/meetings?from=${from}&to=${to}`),
  createMeeting: (m: { title: string; description?: string; startsAt: number; endsAt: number; attendeeIds: string[]; convoId?: string | null }) =>
    request<Meeting>('POST', '/api/meetings', m),
  respondMeeting: (id: string, response: string) => request<Meeting>('PUT', `/api/meetings/${id}/response`, { response }),
  deleteMeeting: (id: string) => request('DELETE', `/api/meetings/${id}`)
}
