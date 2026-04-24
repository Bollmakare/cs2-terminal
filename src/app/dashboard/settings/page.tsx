import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const [{ data: settings }, { data: profile }] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', user.id).single(),
    supabase.from('profiles').select('display_name,steam_id,steam_username,steam_avatar,auth_provider').eq('id', user.id).single(),
  ])
  return <SettingsClient settings={settings} profile={profile} userId={user.id} userEmail={user.email ?? ''} />
}
