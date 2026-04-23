import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendsClient } from './TrendsClient'

export default async function TrendsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <TrendsClient />
}
