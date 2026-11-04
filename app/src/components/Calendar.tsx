import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { formatTime } from '../lib/format'
import { useStore } from '../lib/store'
import type { Meeting } from '../lib/types'

const HOUR = 56 // px per hour, keep in sync with .cal-hour in the stylesheet
const startOfWeek = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  return d.getTime()
}

export function Calendar({ onNew, onOpen }: { onNew: (start?: number) => void; onOpen: (m: Meeting) => void }) {
  const meetings = useStore(s => s.meetings)
  const me = useStore(s => s.me)!
  const toast = useStore(s => s.toast)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [now, setNow] = useState(Date.now())

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.getTime()
  }), [weekStart])

  useEffect(() => {
    const from = weekStart, to = days[6] + 86_400_000
    api.meetings(from, to).then(list => useStore.setState(s => ({
      meetings: [...s.meetings.filter(m => m.endsAt < from || m.startsAt > to), ...list].sort((a, b) => a.startsAt - b.startsAt)
    }))).catch(e => toast(e.message, 'error'))
  }, [weekStart, days, toast])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])

  // Start the view around working hours.
  useEffect(() => { document.getElementById('cal-scroll')?.scrollTo({ top: 7 * HOUR }) }, [])

  const header = new Date(weekStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="main">
      <div className="cal-head">
        <h2>{header}</h2>
        <button className="btn sm" onClick={() => setWeekStart(startOfWeek(Date.now()))}>Today</button>
        <button className="icon-btn" aria-label="Previous week" onClick={() => setWeekStart(w => w - 7 * 86_400_000)}><ChevronLeft size={18} /></button>
        <button className="icon-btn" aria-label="Next week" onClick={() => setWeekStart(w => w + 7 * 86_400_000)}><ChevronRight size={18} /></button>
        <button className="btn primary sm" onClick={() => onNew()}><Plus size={15} /> New meeting</button>
      </div>
      <div className="cal-grid" id="cal-scroll">
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
          {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-hour">{h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}</div>)}
        </div>
        {days.map(d => {
          const dayEnd = d + 86_400_000
          const todays = meetings.filter(m => m.startsAt < dayEnd && m.endsAt > d)
          const isToday = new Date(d).toDateString() === new Date(now).toDateString()
          return (
            <div key={d} className="cal-col" onDoubleClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              const hour = Math.floor((e.clientY - rect.top) / HOUR)
              onNew(d + hour * 3_600_000)
            }}>
              {isToday && <div className="now-line" style={{ top: ((now - d) / 3_600_000) * HOUR }} />}
              {todays.map(m => {
                const s = Math.max(m.startsAt, d), e = Math.min(m.endsAt, dayEnd)
                const top = ((s - d) / 3_600_000) * HOUR
                const height = Math.max(22, ((e - s) / 3_600_000) * HOUR - 2)
                const declined = m.attendees.find(a => a.user.id === me.id)?.response === 'declined'
                return (
                  <button key={m.id} className={`cal-event${declined ? ' declined' : ''}`} style={{ top, height }} onClick={() => onOpen(m)} title={m.title}>
                    <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</b>
                    {height > 38 && <span className="muted">{formatTime(m.startsAt)} – {formatTime(m.endsAt)}</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
