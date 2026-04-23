import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'

export const revalidate = 60 // ISR every 60s

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Parallel data fetch
  const [
    { data: portfolio },
    { data: settings },
    { data: profile },
  ] = await Promise.all([
    supabase.from('portfolios').select('id, name').eq('user_id', user.id).eq('is_default', true).single(),
    supabase.from('user_settings').select('scanner_min_score').eq('user_id', user.id).single(),
    supabase.from('profiles').select('steam_id, display_name, steam_username').eq('id', user.id).single(),
  ])

  if (!portfolio) {
    // Bootstrap â create default portfolio if missing (edge case)
    const { data: newPf } = await supabase
      .from('portfolios')
      .insert({ user_id: user.id, name: 'Main', is_default: true })
      .select('id, name')
      .single()
    return <DashboardClient portfolioId={newPf?.id ?? ''} profile={profile} minScore={60} />
  }

  return (
    <DashboardClient
      portfolioId={portfolio.id}
      profile={profile}
      minScore={settings?.scanner_min_score ?? 60}
    />
  )
}
