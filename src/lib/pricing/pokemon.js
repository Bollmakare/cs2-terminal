import { updateItem, addPriceHistory } from '../api.js'

const BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const CACHE_TTL = 6 * 60 * 60 * 1000

function cacheKey(cardName, setName, number) {
  return `ptcg_${cardName}_${setName}_${number}`.replace(/\s+/g, '_').toLowerCase()
}

function getCached(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts < CACHE_TTL) return data
  } catch {}
  return null
}

function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

function buildQuery(name, setName, number) {
  const parts = []
  if (name) parts.push(`name:"${name}"`)
  if (number) parts.push(`number:"${number}"`)
  if (setName) parts.push(`set.name:"${setName}"`)
  return parts.join(' ')
}

export async function fetchPokemonPrice(item) {
  const meta = item.metadata ?? {}
  if (meta.item_type && meta.item_type !== 'card') return null

  const cardName = item.name
  const setName = meta.set_name ?? ''
  const number = meta.card_number ?? ''

  const key = cacheKey(cardName, setName, number)
  const cached = getCached(key)
  if (cached) return cached

  const q = buildQuery(cardName, setName, number)
  const url = `${BASE_URL}?q=${encodeURIComponent(q)}&pageSize=5`

  let card = null
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TCG API ${res.status}`)
    const json = await res.json()
    const cards = json.data ?? []
    card = cards[0] ?? null
  } catch (e) {
    console.warn('Pokémon price fetch error:', e.message)
    return null
  }

  if (!card) {
    setCache(key, null)
    return null
  }

  const cm = card.cardmarket?.prices?.trendPrice ?? null
  const tcg = card.tcgplayer?.prices?.normal?.market
    ?? card.tcgplayer?.prices?.holofoil?.market
    ?? card.tcgplayer?.prices?.reverseHolofoil?.market
    ?? null

  const result = {
    cardmarket_eur: cm,
    tcgplayer_usd: tcg,
    image: card.images?.small ?? null,
    card_id: card.id,
  }

  setCache(key, result)
  return result
}

export async function fetchAllPokemonPrices(items, onProgress) {
  const cards = items.filter(i => !i.metadata?.item_type || i.metadata.item_type === 'card')
  const results = {}
  let done = 0

  for (const item of cards) {
    const r = await fetchPokemonPrice(item)
    results[item.id] = r
    done++
    onProgress?.(done, cards.length)
    await new Promise(r => setTimeout(r, 300))
  }

  return results
}

export async function applyPokemonPrices(items, priceResults) {
  const ts = new Date().toISOString()
  const applicable = items.filter(item => priceResults[item.id]?.cardmarket_eur != null)

  const tasks = applicable.map(item => {
    const r = priceResults[item.id]
    const price = r.cardmarket_eur
    return updateItem(item.id, {
      value: price,
      last_price_fetched_at: ts,
      metadata: {
        ...item.metadata,
        price_sources: {
          cardmarket_eur: r.cardmarket_eur,
          tcgplayer_usd: r.tcgplayer_usd,
        },
      },
    })
  })
  await Promise.all(tasks)

  // Write price history for sparklines (best-effort, one entry per item per refresh)
  const historyRows = applicable.map(item => ({
    item_id: item.id,
    price: priceResults[item.id].cardmarket_eur,
    source: 'tcgapi',
    user_id: item.user_id ?? null,
  }))
  if (historyRows.length) {
    addPriceHistory(historyRows).catch(e => console.error('[PKM] price_history write failed:', e.message))
  }
}
