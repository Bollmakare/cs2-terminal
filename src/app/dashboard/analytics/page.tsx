import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RiskAnalyticsClient } from './RiskAnalyticsClient'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: portfolio } = await supabase
    .from('portfolios').select('id, name').eq('user_id', user.id).eq('is_default', true).single()

  const { data: settings } = await supabase
    .from('user_settings').select('fee_skinport').eq('user_id', user.id).single()

  if (!portfolio) redirect('/dashboard')

  return (
    <RiskAnalyticsClient
      portfolioId={portfolio.id}
      portfolioName={portfolio.name}
      defaultFeePct={settings?.fee_skinport ?? 12}
    />
  )
}
