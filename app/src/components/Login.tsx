import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { api, defaultServer, getServer, setServer } from '../lib/api'
import { useStore } from '../lib/store'

export function Login() {
  const signIn = useStore(s => s.signIn)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServerField] = useState(getServer())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const showServer = !location.protocol.startsWith('http')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (showServer) setServer(server || defaultServer())
      const res = mode === 'login' ? await api.login(email.trim(), password) : await api.register(name.trim(), email.trim(), password)
      await signIn(res.token, res.user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark"><MessageSquare size={22} /></div>
          <div>
            <h1>Quence Teams</h1>
            <p>Sign in with your Quence account</p>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {mode === 'register' && (
          <label className="field">Name
            <input className="input" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="field">Email
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
        </label>
        <label className="field">Password
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 6 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {showServer && (
          <label className="field">Server
            <input className="input" value={server} onChange={e => setServerField(e.target.value)} placeholder="https://teams.example.com " />
          </label>
        )}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <div className="muted" style={{ textAlign: 'center' }}>
          {mode === 'login' ? 'New to Quence? ' : 'Already have an account? '}
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
