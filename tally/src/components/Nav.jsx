import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { getMyProfile } from '../lib/api.js'

export default function Nav() {
  const [name, setName] = useState('')

  useEffect(() => {
    getMyProfile().then((p) => setName(p?.display_name || '')).catch(() => {})
  }, [])

  return (
    <header className="nav">
      <div className="nav-brand">
        <span className="nav-mark">✓⁚✓⁚⌿</span>
        <span className="nav-title">tally</span>
      </div>
      <nav className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Log
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/accounts" className={({ isActive }) => (isActive ? 'active' : '')}>
          Accounts
        </NavLink>
      </nav>
      {name && <span className="nav-you mono">{name}</span>}
      <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
      <a className="nav-credit" href="https://buildbyace.vercel.app" target="_blank" rel="noreferrer">
        by ace ↗
      </a>
    </header>
  )
}
