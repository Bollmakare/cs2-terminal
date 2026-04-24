import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HistoryClient } from './HistoryClient'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: portfolio } = await supabase.from('portfolios').select('id').eq('user_id', user.id).eq('is_default', true).single()
  if (!portfolio) redirect('/dashboard')
  return <HistoryClient portfolioId={portfolio.id} />
}
