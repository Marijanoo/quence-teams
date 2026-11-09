export type Presence = 'available' | 'busy' | 'dnd' | 'away' | 'offline'

export interface User { id: string; name: string; email: string; title: string; statusMsg: string; color: number; avatar: number; oooUntil?: number | null; oooMsg?: string; bot?: boolean }
export interface Quote { id: string; convoId: string; author: User | null; snippet: string; deleted: boolean; hasAttachment: boolean }
export interface Reaction { emoji: string; userIds: string[] }
export interface PollOption { id: string; text: string; userIds: string[] }
export interface Poll { multi: boolean; options: PollOption[] }
export interface Attachment { id: string; name: string; mime: string; size: number }

export interface Message {
  id: string; seq: number; convoId: string; parentId: string | null
  replyTo: Quote | null
  kind: 'text' | 'call' | 'poll'; subject: string; author: User | null; body: string
  createdAt: number; editedAt: number | null; deleted: boolean; pinned: boolean
  poll: Poll | null
  reactions: Reaction[]; attachments: Attachment[]; replyCount: number; lastReplyAt: number | null
}

export interface Channel {
  id: string; teamId: string; name: string; description: string; isPrivate: boolean; posting?: 'all' | 'owners'; createdBy?: string
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
  recur?: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'; recurUntil?: number | null; occId?: string
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

export interface Scheduled { id: string; convoId: string; parentId: string | null; body: string; sendAt: number; where: string }
export interface Reminder { id: string; messageId: string | null; convoId: string | null; text: string; remindAt: number; message?: Message | null }
export interface LinkCard { url: string; title: string; description: string; site: string }
export interface Webhook { id: string; name: string; createdAt: number; path: string }
export interface EditVersion { body: string; at: number }

export type View = 'activity' | 'chat' | 'calendar' | 'calls'
export type QuickView = 'mentions' | 'drafts' | 'saved' | 'scheduled'
export type Selection = { convoId: string; kind: 'channel' | 'chat'; teamId?: string }
