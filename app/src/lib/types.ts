export type Presence = 'available' | 'busy' | 'dnd' | 'away' | 'offline'

export interface User { id: string; name: string; email: string; title: string; statusMsg: string; color: number }
export interface Quote { id: string; convoId: string; author: User | null; snippet: string; deleted: boolean; hasAttachment: boolean }
export interface Reaction { emoji: string; userIds: string[] }
export interface Attachment { id: string; name: string; mime: string; size: number }

export interface Message {
  id: string; seq: number; convoId: string; parentId: string | null
  replyTo: Quote | null
  kind: 'text' | 'call'; subject: string; author: User | null; body: string
  createdAt: number; editedAt: number | null; deleted: boolean; pinned: boolean
  reactions: Reaction[]; attachments: Attachment[]; replyCount: number; lastReplyAt: number | null
}

export interface Channel {
  id: string; teamId: string; name: string; description: string; isPrivate: boolean
  unread: number; mentions: number
}
export interface Team { id: string; name: string; description: string; role: 'owner' | 'member'; channels: Channel[] }
export interface TeamDetail extends Omit<Team, 'channels'> { members: (User & { role: 'owner' | 'member' })[]; channels: Channel[] }

export interface Chat {
  id: string; type: 'direct' | 'group'; title: string; members: User[]; createdAt: number
  lastMessage: { body: string; kind: string; authorId?: string; createdAt: number } | null
  lastActivity: number; unread: number; mentions: number
}

export interface Meeting {
  id: string; title: string; description: string; convoId: string | null
  organizer: User; startsAt: number; endsAt: number
  attendees: { user: User; response: 'none' | 'accepted' | 'declined' | 'tentative' }[]
}

export interface ActivityItem {
  type: 'mention' | 'reply' | 'reaction'; emoji: string | null; actor: User | null
  message: Message; unseen: boolean
}

export interface SearchHit { message: Message; where: string; kind: 'channel' | 'chat' }

export interface CallLog {
  id: string; room: string; kind: 'direct' | 'group' | 'channel' | 'meeting'; title: string
  startedAt: number; endedAt: number | null; startedBy: User | null
  status: 'joined' | 'missed' | 'declined'; participants: User[]; canCallBack: boolean
}

export type View = 'activity' | 'chat' | 'calendar' | 'calls'
export type QuickView = 'mentions' | 'drafts' | 'saved'
export type Selection = { convoId: string; kind: 'channel' | 'chat'; teamId?: string }
