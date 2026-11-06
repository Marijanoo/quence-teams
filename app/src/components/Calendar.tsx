import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Trash2, Video, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { formatHour, formatTime } from '../lib/format'
import { useSettings } from '../lib/settings'
import { askConfirm, useStore } from '../lib/store'
import type { Meeting } from '../lib/types'
import { ContextMenu, type CtxItem } from './ui'

const HOUR = 56 // px per hour, keep in sync with .cal-hour in the stylesheet
const SNAP = 15 * 60_000
const DAY = 86_400_000
const snap = (ms: number) => Math.round(ms / SNAP) * SNAP

// Meetings that overlap (as drawn, including the minimum height) share the column side by side.
function layoutDay(items: { id: string; top: number; bottom: number }[]) {
  const out = new Map<string, { lane: number; lanes: number }>()
  const sorted = [...items].sort((a, b) => a.top - b.top || b.bottom - a.bottom)
  let cluster: typeof sorted = [], clusterEnd = -Infinity
  const flush = () => {
    const laneEnds: number[] = []
    const lane = new Map<string, number>()
    for (const it of cluster) {
      let i = laneEnds.findIndex(end => end <= it.top)
      if (i < 0) i = laneEnds.length
      laneEnds[i] = it.bottom
      lane.set(it.id, i)
    }
    for (const it of cluster) out.set(it.id, { lane: lane.get(it.id)!, lanes: laneEnds.length })
    cluster = []; clusterEnd = -Infinity
  }
  for (const it of sorted) {
    if (cluster.length && it.top >= clusterEnd) flush()
    cluster.push(it); clusterEnd = Math.max(clusterEnd, it.bottom)
  }
  if (cluster.length) flush()
  return out
}

const startOfWeek = (t: number, first: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() - first + 7) % 7))
  return d.getTime()
}
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

interface Drag { id: string; s: number; e: number }
interface Sel { day: number; a: number; b: number } // day start, and two times inside it

export function Calendar({ onNew, onOpen, onEdit }: { onNew: (start?: number, end?: number) => void; onOpen: (m: Meeting) => void; onEdit: (m: Meeting) => void }) {
  const meetings = useStore(s => s.meetings)
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const joinCall = useStore(s => s.joinCall)
  const cfg = useSettings()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now(), cfg.weekStart))
  const [now, setNow] = useState(Date.now())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null)
  const cols = useRef<(HTMLDivElement | null)[]>([])
  const closeMenu = useCallback(() => setMenu(null), [])

  // Changing the first day of the week in settings re-aligns the view.
  useEffect(() => { setWeekStart(w => startOfWeek(w, cfg.weekStart)) }, [cfg.weekStart])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.getTime()
  }).filter(d => cfg.showWeekends || ![0, 6].includes(new Date(d).getDay())), [weekStart, cfg.showWeekends])

  useEffect(() => {
    const from = weekStart, to = weekStart + 8 * DAY
    api.meetings(from, to).then(list => useStore.setState(s => ({
      meetings: [...s.meetings.filter(m => m.endsAt < from || m.startsAt > to), ...list].sort((a, b) => a.startsAt - b.startsAt)
    }))).catch(e => toast(e.message, 'error'))
  }, [weekStart, toast])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])

  // Start the view a little before the working day.
  useEffect(() => { document.getElementById('cal-scroll')?.scrollTo({ top: Math.max(0, cfg.workStart - 1) * HOUR }) }, [cfg.workStart])

  const header = new Date(weekStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const shown = useMemo(() => drag ? meetings.map(m => m.id === drag.id ? { ...m, startsAt: drag.s, endsAt: drag.e } : m) : meetings, [meetings, drag])

  const replace = (m: Meeting) => useStore.setState(s => ({ meetings: [...s.meetings.filter(x => x.id !== m.id), m].sort((a, b) => a.startsAt - b.startsAt) }))

  // Saves a moved or resized meeting right away and puts it back if the server says no.
  async function commit(m: Meeting, s: number, e: number) {
    if (s === m.startsAt && e === m.endsAt) return
    replace({ ...m, startsAt: s, endsAt: e })
    try { replace(await api.updateMeeting(m.id, { startsAt: s, endsAt: e })) }
    catch (err) { replace(m); toast((err as Error).message, 'error') }
  }

  function beginDrag(ev: React.PointerEvent, m: Meeting, mode: 'move' | 'resize') {
    if (ev.button !== 0) return
    ev.stopPropagation()
    const canMove = m.organizer.id === me.id && ev.pointerType !== 'touch'
    const x0 = ev.clientX, y0 = ev.clientY
    const rects = cols.current.map(c => c?.getBoundingClientRect())
    const col0 = rects.findIndex(r => r && x0 >= r.left && x0 < r.right)
    let moved = false
    let cur = { s: m.startsAt, e: m.endsAt }

    const move = (e: PointerEvent) => {
      if (!canMove) return
      const dy = e.clientY - y0
      if (!moved && Math.hypot(e.clientX - x0, dy) < 5) return
      if (!moved) document.body.classList.add('cal-dragging')
      moved = true
      const dMs = snap((dy / HOUR) * 3_600_000)
      if (mode === 'resize') {
        cur = { s: m.startsAt, e: Math.max(m.startsAt + SNAP, m.endsAt + dMs) }
      } else {
        const col = rects.findIndex(r => r && e.clientX >= r.left && e.clientX < r.right)
        const shift = col >= 0 && col0 >= 0 ? days[col] - days[col0] : 0
        const s = m.startsAt + dMs + shift
        cur = { s, e: s + (m.endsAt - m.startsAt) }
      }
      setDrag({ id: m.id, s: cur.s, e: cur.e })
    }
    const finish = (cancel: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancelled)
      document.body.classList.remove('cal-dragging')
      setDrag(null)
      if (cancel) return
      if (!moved) onOpen(m)
      else void commit(m, cur.s, cur.e)
    }
    const up = () => finish(false)
    const cancelled = () => finish(true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancelled)
  }

  // Dragging over empty space draws a new meeting, like in Teams.
  function beginSelect(ev: React.PointerEvent<HTMLDivElement>, day: number) {
    if (ev.button !== 0 || ev.target !== ev.currentTarget || ev.pointerType === 'touch') return
    const el = ev.currentTarget
    const at = (y: number) => day + Math.max(0, Math.min(DAY, snap(((y - el.getBoundingClientRect().top) / HOUR) * 3_600_000)))
    const a = Math.min(at(ev.clientY), day + DAY - SNAP)
    let b = a
    let moved = false
    const move = (e: PointerEvent) => {
      b = at(e.clientY)
      if (Math.abs(b - a) >= SNAP) moved = true
      if (moved) { document.body.classList.add('cal-dragging'); setSel({ day, a, b }) }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('cal-dragging')
      setSel(null)
      if (moved) onNew(Math.min(a, b), Math.max(a, b))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function slotMenu(ev: React.MouseEvent<HTMLDivElement>, day: number) {
    ev.preventDefault()
    const rect = ev.currentTarget.getBoundingClientRect()
    const start = day + Math.max(0, Math.floor(((ev.clientY - rect.top) / HOUR) * 2)) * 30 * 60_000
    setMenu({
      x: ev.clientX, y: ev.clientY,
      items: [
        { label: `New meeting at ${formatTime(start)}`, icon: <Plus size={15} />, onClick: () => onNew(start) },
        { label: 'Go to today', icon: <CalendarDays size={15} />, divider: false, onClick: () => setWeekStart(startOfWeek(Date.now(), cfg.weekStart)) }
      ]
    })
  }

  function eventMenu(ev: React.MouseEvent, m: Meeting) {
    ev.preventDefault()
    ev.stopPropagation()
    const mine = m.attendees.find(a => a.user.id === me.id)
    const organizer = m.organizer.id === me.id
    const respond = (r: string) => api.respondMeeting(m.id, r).then(replace).catch(e => toast(e.message, 'error'))
    const items: CtxItem[] = [
      { label: 'Open', icon: <ExternalLink size={15} />, onClick: () => onOpen(m) },
      { label: 'Join', icon: <Video size={15} />, onClick: () => joinCall(m.id, m.title) }
    ]
    if (organizer) {
      items.push(
        { label: 'Edit', icon: <Pencil size={15} />, onClick: () => onEdit(m) },
        { label: '', onClick: () => {}, divider: true },
        { label: 'Cancel meeting', icon: <Trash2 size={15} />, danger: true, onClick: async () => {
          if (await askConfirm({ title: 'Cancel this meeting?', message: "It will be removed from everyone's calendar.", confirmLabel: 'Cancel meeting', danger: true })) {
            api.deleteMeeting(m.id).then(() => useStore.setState(s => ({ meetings: s.meetings.filter(x => x.id !== m.id) }))).catch(e => toast(e.message, 'error'))
          }
        } }
      )
    } else if (mine) {
      items.push(
        { label: '', onClick: () => {}, divider: true },
        { label: 'Accept', icon: <Check size={15} />, checked: mine.response === 'accepted', onClick: () => respond('accepted') },
        { label: 'Maybe', icon: <span style={{ width: 15 }} />, checked: mine.response === 'tentative', onClick: () => respond('tentative') },
        { label: 'Decline', icon: <span style={{ width: 15 }} />, checked: mine.response === 'declined', onClick: () => respond('declined') }
      )
    }
    setMenu({ x: ev.clientX, y: ev.clientY, items })
  }

  const gridStyle = { '--cols': days.length } as React.CSSProperties

  return (
    <div className="main">
      <div className="cal-head">
        <h2>{header}</h2>
        <button className="btn sm" onClick={() => setWeekStart(startOfWeek(Date.now(), cfg.weekStart))}>Today</button>
        <button className="icon-btn" aria-label="Previous week" onClick={() => setWeekStart(w => w - 7 * DAY)}><ChevronLeft size={18} /></button>
        <button className="icon-btn" aria-label="Next week" onClick={() => setWeekStart(w => w + 7 * DAY)}><ChevronRight size={18} /></button>
        <button className="btn primary sm" onClick={() => onNew()}><Plus size={15} /> New meeting</button>
      </div>
      <div className="cal-grid" id="cal-scroll" style={gridStyle}>
        <div className="cal-dayhead" style={{ borderLeft: 'none' }} />
        {days.map(d => {
          const isToday = new Date(d).toDateString() === new Date(now).toDateString()
          return (
            <div key={d} className={`cal-dayhead${isToday ? ' today' : ''}`}>
              <div className="muted" style={{ fontSize: 11 }}>{new Date(d).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</div>
              <b>{new Date(d).getDate()}</b>
            </div>
          )
        })}
        <div className="cal-hours">
          {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-hour">{h === 0 ? '' : formatHour(h)}</div>)}
        </div>
        {days.map((d, di) => {
          const dayEnd = startOfDay(d + 36 * 3_600_000) // next midnight, safe across clock changes
          const todays = shown.filter(m => m.startsAt < dayEnd && m.endsAt > d)
          const isToday = new Date(d).toDateString() === new Date(now).toDateString()
          const boxes = todays.map(m => {
            const top = ((Math.max(m.startsAt, d) - d) / 3_600_000) * HOUR
            return { id: m.id, top, bottom: top + Math.max(22, ((Math.min(m.endsAt, dayEnd) - Math.max(m.startsAt, d)) / 3_600_000) * HOUR - 2) }
          })
          const lanes = layoutDay(boxes)
          return (
            <div key={d} ref={el => { cols.current[di] = el }} className="cal-col"
              onPointerDown={e => beginSelect(e, d)}
              onContextMenu={e => slotMenu(e, d)}
              onDoubleClick={e => {
                if (e.target !== e.currentTarget) return
                const rect = e.currentTarget.getBoundingClientRect()
                onNew(d + Math.floor((e.clientY - rect.top) / HOUR) * 3_600_000)
              }}>
              <div className="cal-off" style={{ top: 0, height: cfg.workStart * HOUR }} />
              <div className="cal-off" style={{ top: cfg.workEnd * HOUR, bottom: 0 }} />
              {isToday && <div className="now-line" style={{ top: ((now - d) / 3_600_000) * HOUR }} />}
              {sel?.day === d && (
                <div className="cal-select" style={{ top: ((Math.min(sel.a, sel.b) - d) / 3_600_000) * HOUR, height: Math.max(8, (Math.abs(sel.b - sel.a) / 3_600_000) * HOUR) }}>
                  <span>{formatTime(Math.min(sel.a, sel.b))} – {formatTime(Math.max(sel.a, sel.b))}</span>
                </div>
              )}
              {todays.map(m => {
                const s = Math.max(m.startsAt, d), e = Math.min(m.endsAt, dayEnd)
                const top = ((s - d) / 3_600_000) * HOUR
                const height = Math.max(22, ((e - s) / 3_600_000) * HOUR - 2)
                const { lane, lanes: count } = lanes.get(m.id)!
                const declined = m.attendees.find(a => a.user.id === me.id)?.response === 'declined'
                const organizer = m.organizer.id === me.id
                const dragging = drag?.id === m.id
                return (
                  <div key={m.id} role="button" tabIndex={0}
                    className={`cal-event${declined ? ' declined' : ''}${organizer ? ' own' : ''}${dragging ? ' dragging' : ''}`}
                    style={{ top, height, left: `calc(${(lane / count) * 100}% + 3px)`, right: 'auto', width: `calc(${100 / count}% - 6px)` }}
                    onPointerDown={e => beginDrag(e, m, 'move')}
                    onContextMenu={e => eventMenu(e, m)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(m) } }}
                    title={`${m.title}\n${formatTime(m.startsAt)} – ${formatTime(m.endsAt)}`}>
                    <b className="cal-title">{m.title}</b>
                    {(height > 38 || dragging) && <span className="muted">{formatTime(m.startsAt)} – {formatTime(m.endsAt)}</span>}
                    {organizer && <i className="cal-resize" onPointerDown={e => beginDrag(e, m, 'resize')} aria-hidden />}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  )
}
