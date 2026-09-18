import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } }
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="nav-mark" style={{ marginBottom: 8 }}>✓⁚✓⁚⌿</div>
        <h1 className="page-title">tally</h1>
        <p className="page-sub">Track hours across your own and your friends' accounts.</p>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Your name</label>
              <input
                type="text"
                placeholder="What should people see you as?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Password</label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={busy || !email || !password} style={{ width: '100%' }}>
            {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>}
        </form>

        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 16, textAlign: 'center' }}>
          {mode === 'signup' ? 'Already have an account? ' : "New here? "}
          <span
            style={{ color: 'var(--mint)', cursor: 'pointer' }}
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup')
              setError('')
            }}
          >
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </span>
        </p>
      </div>
    </div>
  )
}
