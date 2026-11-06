import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { Dialog } from './ui'

const MAX_OPTIONS = 10

export function PollDialog({ convoId, parentId, initialQuestion = '', initialOptions, onClose }: {
  convoId: string; parentId?: string; initialQuestion?: string; initialOptions?: string[]; onClose: () => void
}) {
  const toast = useStore(s => s.toast)
  const [question, setQuestion] = useState(initialQuestion)
  const [options, setOptions] = useState(initialOptions?.length ? initialOptions : ['', ''])
  const [multi, setMulti] = useState(false)
  const [busy, setBusy] = useState(false)
  const filled = options.map(o => o.trim()).filter(Boolean)
  const valid = question.trim().length > 0 && filled.length >= 2 && new Set(filled.map(o => o.toLowerCase())).size === filled.length

  async function create() {
    if (!valid || busy) return
    setBusy(true)
    try {
      await api.createPoll(convoId, { question: question.trim(), options: filled, multi, parentId })
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }

  return (
    <Dialog title="Create a poll" onClose={onClose}>
      <form className="poll-form" onSubmit={e => { e.preventDefault(); void create() }}>
        <label className="field"><span>Question</span>
          <input className="input" value={question} maxLength={300} autoFocus placeholder="Ask a question" onChange={e => setQuestion(e.target.value)} />
        </label>
        <div className="field"><span>Options</span></div>
        {options.map((o, i) => (
          <div className="row" key={i}>
            <input className="input" value={o} maxLength={100} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`}
              onChange={e => setOptions(list => list.map((x, j) => j === i ? e.target.value : x))} />
            {options.length > 2 && <button type="button" className="icon-btn" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(list => list.filter((_, j) => j !== i))}><X size={16} /></button>}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOptions(list => [...list, ''])}><Plus size={14} />Add option</button>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} />Allow several answers
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>Post poll</button>
        </div>
      </form>
    </Dialog>
  )
}
