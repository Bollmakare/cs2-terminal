import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortfolioClient } from './PortfolioClient'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single()

  if (!portfolio) redirect('/dashboard')

  return (
    <PortfolioClient
      portfolioId={portfolio.id}
      portfolioName={portfolio.name}
    />
  )
}
