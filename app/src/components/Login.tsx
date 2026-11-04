import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, defaultServer, getServer, setServer } from '../lib/api'
import { useStore } from '../lib/store'
import { TitleBar } from './TitleBar'
import { BottomBar } from './BottomBar'
import { isNative } from '../lib/platform'

// Mirrors the Quence API sign-in screen: title bar on top, centred form, labels above the inputs.
export function Login() {
  const signIn = useStore(s => s.signIn)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServerField] = useState(getServer())
  const [showServer, setShowServer] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const desktop = !location.protocol.startsWith('http') || isNative

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (desktop) setServer(server.trim() || defaultServer())
      const res = mode === 'login' ? await api.login(email.trim(), password) : await api.register(name.trim(), email.trim(), password)
      await signIn(res.token, res.user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <TitleBar />
      <div className="login-center">
        <form className="login-form" onSubmit={submit}>
          <div className="login-head">
            <img src="./logo.svg" alt="Quence Teams" width={56} height={56} />
            <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
            <p>{mode === 'login' ? 'Enter your credentials to continue' : 'Fill in the details below to get started'}</p>
          </div>

          {mode === 'register' && (
            <div className="form-row">
              <label htmlFor="name">Name</label>
              <input id="name" className="input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required disabled={busy} />
            </div>
          )}
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
              autoComplete={mode === 'login' ? 'username' : 'email'} required disabled={busy} autoFocus />
          </div>
          <div className="form-row">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 6 : undefined} disabled={busy} />
          </div>

          {desktop && showServer && (
            <div className="form-row">
              <label htmlFor="server">Server</label>
              <input id="server" className="input" value={server} onChange={e => setServerField(e.target.value)} placeholder="https://teams.kolaj.fun" disabled={busy} />
            </div>
          )}

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="btn primary block" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}{mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="login-switch">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
          {desktop && !showServer && (
            <p className="login-switch" style={{ marginTop: -8 }}>
              <button type="button" className="link-btn muted-link" onClick={() => setShowServer(true)}>Change server</button>
            </p>
          )}
        </form>
      </div>
      <BottomBar />
    </div>
  )
}
