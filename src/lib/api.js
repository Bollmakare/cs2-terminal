import { supabase } from './supabase.js'

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

export async function addPriceHistory(entry) {
  const { error } = await supabase.from('price_history').insert(entry)
  if (error) throw error
}

export async function getPriceHistory(itemId) {
  let q = supabase.from('price_history').select('*').order('recorded_at', { ascending: true })
  if (itemId === null) {
    q = q.is('item_id', null).eq('source', 'snapshot')
  } else {
    q = q.eq('item_id', itemId)
  }
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getSnapshotHistory() {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .is('item_id', null)
    .eq('source', 'snapshot')
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
