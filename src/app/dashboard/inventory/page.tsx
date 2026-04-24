import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InventoryClient } from './InventoryClient'

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Get user steam_id from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('steam_id, display_name, steam_username')
    .eq('id', user.id)
    .single()

  // Get default portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single()

  return (
    <InventoryClient
      steamId={profile?.steam_id ?? null}
      portfolioId={portfolio?.id ?? null}
      userId={user.id}
    />
  )
}
