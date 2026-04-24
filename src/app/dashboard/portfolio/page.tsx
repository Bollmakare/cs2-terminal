import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortfolioClient } from './PortfolioClient'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: portfolio },
    { data: settings },
    { data: profile },
  ] = await Promise.all([
    supabase.from('portfolios').select('id, name').eq('user_id', user.id).eq('is_default', true).single(),
    supabase.from('user_settings').select('fee_skinport, fee_steam, fee_csfloat').eq('user_id', user.id).single(),
    supabase.from('profiles').select('steam_id').eq('id', user.id).single(),
  ])

  if (!portfolio) redirect('/dashboard')

  return (
    <PortfolioClient
      portfolioId={portfolio.id}
      portfolioName={portfolio.name}
      steamId={profile?.steam_id ?? null}
      fees={{
        skinport: settings?.fee_skinport ?? 12,
        steam:    settings?.fee_steam ?? 13,
        csfloat:  settings?.fee_csfloat ?? 2,
      }}
    />
  )
}
