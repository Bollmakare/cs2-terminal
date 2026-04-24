import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TerminalSidebar } from '@/components/terminal/Sidebar'
import { TerminalTopbar } from '@/components/terminal/Topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: portfolios }] = await Promise.all([
    supabase.from('profiles').select('display_name, steam_username, steam_avatar, steam_id').eq('id', user.id).single(),
    supabase.from('portfolios').select('id, name, is_default').eq('user_id', user.id).order('created_at'),
  ])

  return (
    <div className="flex h-screen bg-terminal-bg overflow-hidden">
      <TerminalSidebar
        profile={profile}
        portfolios={portfolios ?? []}
        userId={user.id}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TerminalTopbar userId={user.id} />
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
