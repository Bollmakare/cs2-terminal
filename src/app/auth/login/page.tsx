import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LoginPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg p-4">
      <div className="panel p-0 overflow-hidden w-full max-w-md">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-terminal-border bg-black/40">
          <span className="ml-2 font-mono text-[11px] text-muted-3 tracking-widest uppercase">CS2 TERMINAL - AUTH</span>
        </div>
        <div className="p-8">
          <div className="mb-8">
            <div className="font-mono text-[28px] font-bold text-green">CS2_TERMINAL</div>
            <div className="font-mono text-[11px] text-muted-3 tracking-widest uppercase mt-1">Professional skin analytics</div>
          </div>
          <div className="space-y-3">
            <Link href="/auth/login/email"
              className="btn-primary w-full text-sm py-3 flex items-center justify-center gap-2">
              Sign in with Email
            </Link>
            <Link href="/auth/signup"
              className="btn-terminal w-full text-sm py-3 flex items-center justify-center gap-2">
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
