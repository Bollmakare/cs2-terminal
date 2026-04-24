import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit  = parseInt(req.nextUrl.searchParams.get('limit') ?? '20')
  const source = req.nextUrl.searchParams.get('source') ?? 'all'
  const tag    = req.nextUrl.searchParams.get('tag')

  let query = supabase.from('news_cache').select('*').order('published_at', { ascending: false }).limit(limit)
  if (source !== 'all') query = query.eq('source', source)
  if (tag) query = query.contains('tags', [tag])

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ news: data })
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  let inserted = 0

  const RSS_FEEDS = [{ url: 'https://store.steampowered.com/feeds/news/app/730/?cc=US&l=english', source: 'valve_blog' }]

  for (const feed of RSS_FEEDS) {
    try {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(feed.url, { signal: ctrl.signal, headers: { 'User-Agent': 'CS2Terminal/1.0' } })
      clearTimeout(timeout)
      if (!res.ok) continue
      const xml = await res.text()
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      for (const [, ix] of items) {
        const title = stripCDATA(extractTag(ix, 'title'))
        const url = extractTag(ix, 'link')
        const pubDate = extractTag(ix, 'pubDate')
        const desc = stripCDATA(extractTag(ix, 'description'))
        if (!title) continue
        const id = crypto.createHash('md5').update(url || title).digest('hex').slice(0, 16)
        const tags = inferTags(title + ' ' + desc)
        const summary = desc?.replace(/<[^>]+>/g, '').slice(0, 300).trim()
        await supabase.from('news_cache').upsert({ id, source: feed.source, title: title.slice(0, 300), summary: summary || null, url: url || null, published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(), tags, fetched_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true })
        inserted++
      }
    } catch (err) { console.error(`[news] failed:`, err.message) }
  }
  return NextResponse.json({ inserted })
}

function extractTag(xml, tag) { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return m?.[1]?.trim() ?? '' }
function stripCDATA(s) { return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() }
function inferTags(text) { const l = text.toLowerCase(); const t = []; if (l.includes('case')) t.push('case'); if (l.includes('major')) t.push('major'); if (l.includes('patch')) t.push('patch'); return t.length > 0 ? t : ['general'] }
