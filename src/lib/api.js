import { supabase } from './supabase.js'

// ── Items ────────────────────────────────────────────────────────────────────

export async function getItems(vertical) {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false })
  if (vertical) q = q.eq('vertical', vertical)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function addItem(item) {
  const { data, error } = await supabase.from('items').insert(item).select().single()
  if (error) throw error
  return data
}

export async function updateItem(id, updates) {
  const { data, error } = await supabase.from('items').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw error
}

// ── Price History ────────────────────────────────────────────────────────────

export async function addPriceHistory(entry) {
  const { error } = await supabase.from('price_history').insert(entry)
  if (error) throw error
}

export async function deletePriceHistory(id) {
  const { error } = await supabase.from('price_history').delete().eq('id', id)
  if (error) throw error
}

export async function getItemPriceHistory(itemId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('item_id', itemId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return data
}

export async function getItemsPriceHistory(itemIds) {
  if (!itemIds.length) return {}
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('price_history')
    .select('item_id, price, recorded_at')
    .in('item_id', itemIds)
    .not('item_id', 'is', null)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  const map = {}
  for (const row of data ?? []) {
    if (!map[row.item_id]) map[row.item_id] = []
    map[row.item_id].push(row.price)
  }
  return map
}

export async function getSnapshotHistory() {
  // Combine user snapshots + cron snapshots for equity curve
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .is('item_id', null)
    .in('source', ['snapshot', 'snapshot-cs2', 'snapshot-pokemon', 'snapshot-wine', 'cron-cs2', 'cron-pokemon'])
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return data
}

export async function getTodaySnapshot() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .is('item_id', null)
    .eq('source', 'snapshot')
    .gte('recorded_at', today.toISOString())
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

// ── Wishlist ──────────────────────────────────────────────────────────────────

export async function getWishlistItems() {
  const { data, error } = await supabase.from('wishlist_items').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addWishlistItem(item) {
  const { data, error } = await supabase.from('wishlist_items').insert(item).select().single()
  if (error) throw error
  return data
}

export async function deleteWishlistItem(id) {
  const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
  if (error) throw error
}

// ── Sold Items ────────────────────────────────────────────────────────────────

export async function addSoldItem(entry) {
  const { data, error } = await supabase.from('sold_items').insert(entry).select().single()
  if (error) throw error
  return data
}

export async function getSoldItems() {
  const { data, error } = await supabase
    .from('sold_items')
    .select('*')
    .order('sold_at', { ascending: false })
  if (error) throw error
  return data
}

export async function deleteSoldItem(id) {
  const { error } = await supabase.from('sold_items').delete().eq('id', id)
  if (error) throw error
}

// ── Consumed Items ────────────────────────────────────────────────────────────

export async function addConsumedItem(entry) {
  const { data, error } = await supabase.from('consumed_items').insert(entry).select().single()
  if (error) throw error
  return data
}

export async function getConsumedItems() {
  const { data, error } = await supabase
    .from('consumed_items')
    .select('*')
    .order('consumed_at', { ascending: false })
  if (error) throw error
  return data
}

export async function deleteConsumedItem(id) {
  const { error } = await supabase.from('consumed_items').delete().eq('id', id)
  if (error) throw error
}

// ── API Usage ────────────────────────────────────────────────────────────────

export async function getApiUsage() {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 7) + '-01'

  // User's own usage today
  const { data: userToday } = await supabase
    .from('api_usage')
    .select('calls_today, calls_month')
    .eq('service', 'pricempire')
    .eq('date', today)
    .maybeSingle()

  // Cron/system usage this month (user_id IS NULL rows are publicly readable)
  const { data: cronMonth } = await supabase
    .from('api_usage')
    .select('calls_today')
    .eq('service', 'pricempire')
    .is('user_id', null)
    .gte('date', monthStart)
    .lte('date', today)

  const cronDay = await supabase
    .from('api_usage')
    .select('calls_today')
    .eq('service', 'pricempire')
    .is('user_id', null)
    .eq('date', today)
    .maybeSingle()
    .then(r => r.data?.calls_today ?? 0)

  const cronMonthTotal = cronMonth?.reduce((s, r) => s + (r.calls_today ?? 0), 0) ?? 0

  return {
    // Combined (cron + user) counts for the status bar
    day: (userToday?.calls_today ?? 0) + cronDay,
    month: (userToday?.calls_month ?? 0) + cronMonthTotal,
    dayLimit: 95,
    monthLimit: 950,
  }
}

export async function bumpApiUsage(userId) {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 7) + '-01'

  // Read today's user row
  const { data: existing } = await supabase
    .from('api_usage')
    .select('id, calls_today, calls_month')
    .eq('service', 'pricempire')
    .eq('date', today)
    .eq('user_id', userId)
    .maybeSingle()

  // Compute month total across all days this month for this user
  const { data: monthRows } = await supabase
    .from('api_usage')
    .select('calls_today')
    .eq('service', 'pricempire')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', today)

  const callsMonth = monthRows?.reduce((s, r) => s + (r.calls_today ?? 0), 0) ?? 0
  const callsToday = existing?.calls_today ?? 0
  const now = new Date().toISOString()

  if (existing) {
    await supabase
      .from('api_usage')
      .update({ calls_today: callsToday + 1, calls_month: callsMonth + 1, last_refresh: now })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('api_usage')
      .insert({ service: 'pricempire', date: today, calls_today: 1, calls_month: callsMonth + 1, last_refresh: now, user_id: userId })
  }
}
