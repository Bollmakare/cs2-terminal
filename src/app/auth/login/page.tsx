'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [showEmail, setShowEmail] = useState(false)

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard'); router.refresh()
  }

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-terminal-border bg-black/40">
        <span className="ml-2 font-mono text-[11px] text-muted-3 tracking-widest uppercase">CS2 TERMINAL ??? AUTH</span>
      </div>
      <div className="p-8">
        <div className="mb-8">
          <div className="font-mono text-[28px] font-bold text-green">CS2_TERMINAL</div>
          <div className="font-mono text-[11px] text-muted-3 tracking-widest uppercase mt-1">Professional skin analytics</div>
        </div>
        <a href="/api/auth/steam" className="flex items-center justify-center gap-3 w-full py-3.5 rounded border-2 border-[#171a21] bg-[#171a21] hover:bg-[#1e2328] transition-all duration-150 mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z" fill="#67C1F5"/></svg>
          <div className="text-left"><div className="font-mono font-bold text-sm text-[#c6d4df]">Sign in with Steam</div><div className="font-mono text-[10px] text-[#8f98a0]">One-click inventory import</div></div>
        </a>
        <div className="flex items-center gap-3 mb-4"><div className="flex-1 h-px bg-terminal-border" /><span className="font-mono text-[10px] text-muted-3 uppercase">or</span><div className="flex-1 h-px bg-terminal-border" /></div>
        {!showEmail ? <button onClick={() => setShowEmail(true)} className="w-full py-2.5 rounded border border-terminal-border-2 bg-terminal-surface font-mono text-xs text-muted-2">Sign in with email</button> : (
          <form onSubmit={handleEmailLogin} className="space-y-3">
            {error && <div className="px-3 py-2 rounded border border-red-500/30 bg-red-soft font-mono text-xs text-red-400">{error}</div>}
            <div><label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus className="input-terminal" /></div>
            <div><label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="????????????????????????""&WV?&VB6?74??S?&??WBxFW&????"????F?c???'WGF??G?S?'7V&??B"6?74??S?&'F?x&??'?r?gV???W7F?g??6V?FW""F?6&?VCx???F??w?????F??r?tWF?V?F?6F??r???r?u6?v???(i"w???'WGF??????f?&???????F?b6?74??S?&xB?bB?B&?&FW"xB&?&FW"xFW&?????&?&FW"#??6?74??S?&f??B?????FW?B????FW?B?xWFVB?2FW?B?6V?FW"#???66?V?C???&Vc?"?WF??6?v?W"6?74??S?'FW?B?w&VV???fW#?V?FW&???R#?&Vv?7FW#????????F?c????F?c????F?c?????