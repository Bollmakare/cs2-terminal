import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login'
const STEAM_ID_REGEX   = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const mode = searchParams.get('openid.mode')
  if (mode !== 'id_res') return NextResponse.redirect(`${appUrl}/auth/login?error=steam_cancelled`)

  const verifyParams = new URLSearchParams(searchParams)
  verifyParams.set('openid.mode', 'check_authentication')

  try {
    const res = await fetch(STEAM_OPENID_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: verifyParams.toString() })
    const text = await res.text()
    if (!text.includes('is_valid:true')) return NextResponse.redirect(`${appUrl}/auth/login?error=steam_invalid`)
  } catch {
    return NextResponse.redirect(`${appUrl}/auth/login?error=steam_network`)
  }

  const claimedId = searchParams.get('openid.claimed_id') ?? ''
  const match = claimedId.match(STEAM_ID_REGEX)
  if (!match) return NextResponse.redirect(`${appUrl}/auth/login?error=steam_id_missing`)
  const steamId = match[1]

  let steamUsername = `steam_${steamId}`
  let steamAvatar = ''

  if (process.env.STEAM_API_KEY) {
    try {
      const pr = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`)
      const pd = await pr.json()
      const pl = pd?.response?.players?.[0]
      if (pl) { steamUsername = pl.personaname ?? steamUsername; steamAvatar = pl.avatarfull ?? '' }
    } catch {}
  }

  const supabase = createServiceClient()
  const { data: ep } = await supabase.from('profiles').select('id').eq('steam_id', steamId).single()
  let userId

  if (ep) {
    userId = ep.id
    await supabase.from('profiles').update({ steam_username: steamUsername, steam_avatar: steamAvatar, updated_at: new Date().toISOString() }).eq('id', userId)
  } else {
    const email = `steam_${steamId}@cs2terminal.app`
    const { data: pbe } = await supabase.from('profiles').select('id').eq('email', email).single()
    if (pbe) { userId = pbe.id } else {
      const { data: nu, error: ce } = await supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { steam_id: steamId, steam_username: steamUsername } })
      if (ce || !nu.user) return NextResponse.redirect(`${appUrl}/auth/login?error=user_create_failed`)
      userId = nu.user.id
    }
    await supabase.from('profiles').upsert({ id: userId, email: `steam_${steamId}@cs2terminal.app`, display_name: steamUsername, steam_id: steamId, steam_username: steamUsername, steam_avatar: steamAvatar, auth_provider: 'steam' }, { onConflict: 'id' })
  }

  const { data: ld, error: le } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: `steam_${steamId}@cs2terminal.app`, options: { redirectTo: `${appUrl}/dashboard` } })
  if (le || !ld?.properties?.hashed_token) return NextResponse.redirect(`${appUrl}/auth/login?error=session_failed`)

  const cu = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`)
  cu.searchParams.set('token', ld.properties.hashed_token)
  cu.searchParams.set('type', 'magiclink')
  cu.searchParams.set('redirect_to', `${appUrl}/dashboard`)
  return NextResponse.redirect(cu.toString())
}
