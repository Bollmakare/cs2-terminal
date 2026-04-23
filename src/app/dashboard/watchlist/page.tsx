import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WatchlistClient } from './WatchlistClient'

export default async function WatchlistPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <WatchlistClient />
}
