'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [done, setDone] = useState(false)
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/auth/callback' } })
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
  }
  return (
    <div className="panel p-0 overflow-hidden">
      <div className="p-8">
        <div className="mb-6"><div className="font-mono text-xl font-bold text-[var(--text)]">Create account</div><div className="font-mono text-[11px] text-muted-3 mt-1">Or <a href="/api/auth/steam" className="text-green">sign in with Steam</a></div></div>
        {done ? (<div className="text-center py-4"><p className="font-mono text-sm text-[var(--text)] mb-1">Check your email</p><a href="/auth/login" className="block mt-4 font-mono text-xs text-green">Back to login</a></div>) : (
          <form onSubmit={handleSignup} className="space-y-3">
            {error && <div className="font-mono text-xs text-red-400">{error}</div>}
            <div><label className="block font-mono text-[9px] uppercase text-muted-3 mb-1.5">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className="input-terminal" /></div>
            <div><label className="block font-mono text-[9px] uppercase text-muted-3 mb-1.5">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 chars" required className="input-terminal" /></div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>{loading ? 'Creating...' : 'Create account '}</button>
            <p className="font-mono text-[10px] text-muted-3 text-center">Already registered? <a href="/auth/login" className="text-green">Foot in</a></p>
          </form>
        )}
      </div>
    </div>
  )
}
