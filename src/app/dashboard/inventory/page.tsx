import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InventoryHub } from './InventoryHub'

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('steam_id')
    .eq('id', user.id)
    .single()

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return (
    <InventoryHub
      steamId={profile?.steam_id ?? null}
      portfolioId={portfolio?.id ?? null}
    />
  )
}