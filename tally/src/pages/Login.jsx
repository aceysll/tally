import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: { display_name: displayName || email.split('@')[0] },
          emailRedirectTo: window.location.origin
        }
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="nav-mark" style={{ marginBottom: 8 }}>✓⁚✓⁚⌿</div>
        <h1 className="page-title">tally</h1>
        <p className="page-sub">Track hours across your own and your friends' accounts.</p>

        {sent ? (
          <p style={{ color: 'var(--mint)', fontSize: 14 }}>
            Check {email} for a sign-in link. You can close this tab.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Your name</label>
              <input
                type="text"
                placeholder="What should people see you as?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Email</label>
              <input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={sending || !email} style={{ width: '100%' }}>
              {sending ? 'Sending link...' : 'Send sign-in link'}
            </button>
            {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
