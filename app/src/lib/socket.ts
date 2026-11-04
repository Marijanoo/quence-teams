import { getServer, getToken } from './api'

type Handler = (data: any) => void

// Reconnecting WebSocket with a tiny event bus.
class Socket {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private retry = 0
  private timer: number | null = null
  private wanted = false
  private pending: string[] = []
  onStatus: (connected: boolean) => void = () => {}

  connect() {
    this.wanted = true
    this.open()
  }

  private open() {
    const token = getToken()
    if (!token || this.ws) return
    const server = getServer()
    const base = server ? server.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.onStatus(true)
      for (const m of this.pending.splice(0)) ws.send(m)
    }
    ws.onmessage = e => {
      try {
        const { event, data } = JSON.parse(e.data)
        this.handlers.get(event)?.forEach(h => h(data))
      } catch { /* ignore malformed frames */ }
    }
    ws.onclose = () => {
      this.ws = null
      this.onStatus(false)
      this.handlers.get('close')?.forEach(h => h(null))
      if (!this.wanted) return
      const delay = Math.min(15000, 500 * 2 ** this.retry++)
      this.timer = window.setTimeout(() => this.open(), delay)
    }
    ws.onerror = () => ws.close()
  }

  disconnect() {
    this.wanted = false
    if (this.timer) clearTimeout(this.timer)
    this.ws?.close()
    this.ws = null
  }

  send(event: string, data: unknown = {}) {
    const frame = JSON.stringify({ event, data })
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame)
    else if (event.startsWith('call.join')) this.pending.push(frame)
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => { this.handlers.get(event)?.delete(handler) }
  }
}

export const socket = new Socket()
