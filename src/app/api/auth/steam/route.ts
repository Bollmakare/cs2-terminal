import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL + '/api/auth/steam/callback'
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': process.env.NEXT_PUBLIC_APP_URL,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })
  return NextResponse.redirect('https://steamcommunity.com/openid/login?' + params.toString())
}
