import { updateItem, bumpApiUsage } from '../api.js'

const API_KEY = '83c3a015-8f1c-4e45-b2a8-922d60e31678'
const BASE_URL = 'https://api.pricempire.com/v3/items/prices'
const SOURCES = 'skinport,buff163,csfloat,steam'
const CACHE_TTL = 6 * 60 * 60 * 1000
const DAY_LIMIT = 95
const MONTH_LIMIT = 950

// localStorage keys for fast local limit checking (synced from Supabase but fast to read)
function todayKey() {
  const d = new Date()
  return `pe_d_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`
}
function monthKey() {
  const d = new Date()
  return `pe_m_${d.getFullYear()}_${d.getMonth() + 1}`
}

export function getLocalUsage() {
  return {
    day: parseInt(localStorage.getItem(todayKey()) || '0', 10),
    month: parseInt(localStorage.getItem(monthKey()) || '0', 10),
    dayLimit: DAY_LIMIT,
    monthLimit: MONTH_LIMIT,
  }
}

function bumpLocalUsage() {
  const dk = todayKey(), mk = monthKey()
  localStorage.setItem(dk, String(parseInt(localStorage.getItem(dk) || '0', 10) + 1))
  localStorage.setItem(mk, String(parseInt(localStorage.getItem(mk) || '0', 10) + 1))
}

export function syncLocalUsageFromDb(usage) {
  if (usage?.day != null) localStorage.setItem(todayKey(), String(usage.day))
  if (usage?.month != null) localStorage.setItem(monthKey(), String(usage.month))
}

export function checkLimits() {
  const { day, month } = getLocalUsage()
  return day < DAY_LIMIT && month < MONTH_LIMIT
}

function cacheKey(name) {
  return `pe_price_${encodeURIComponent(name)}`
}

function getCached(name) {
  try {
    const raw = localStorage.getItem(cacheKey(name))
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts < CACHE_TTL) return data
  } catch {}
  return null
}

function setCache(name, data) {
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

function isCacheStale(name) {
  try {
    const raw = localStorage.getItem(cacheKey(name))
    if (!raw) return true
    const { ts } = JSON.parse(raw)
    return Date.now() - ts >= CACHE_TTL
  } catch {
    return true
  }
}

export function isAnyStale(items) {
  return items.some(i => isCacheStale(i.name))
}

export let lastPriceSource = null

const SKINPORT_URL = 'https://api.skinport.com/v1/items?app_id=730&currency=EUR'

async function fetchFromSkinport(items) {
  const res = await fetch(SKINPORT_URL)
  if (!res.ok) throw new Error(`Skinport ${res.status}`)
  const list = await res.json()
  const priceMap = {}
  for (const entry of list) {
    if (entry.suggested_price != null) priceMap[entry.market_hash_name] = entry.suggested_price
  }
  const results = {}
  for (const item of items) {
    const price = priceMap[item.name]
    if (!price) { results[item.id] = null; continue }
    results[item.id] = { price, sources: { skinport: price }, name: item.name }
  }
  lastPriceSource = 'skinport'
  return results
}

export async function fetchCS2Prices(items, userId, onProgress) {
  if (!items.length) return {}

  // Try PriceEmpire first if within rate limits
  if (checkLimits()) {
    const url = `${BASE_URL}?api_key=${API_KEY}&currency=EUR&sources=${SOURCES}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`PriceEmpire ${res.status}`)
      const priceMap = await res.json()
      bumpLocalUsage()
      if (userId) bumpApiUsage(userId).catch(() => {})

      const results = {}
      for (const item of items) {
        const raw = priceMap[item.name]
        if (!raw) { results[item.id] = null; continue }

        const sources = {}
        const vals = []
        for (const src of SOURCES.split(',')) {
          const v = raw[src]?.price
          if (v != null && v > 0) { sources[src] = v / 100; vals.push(v / 100) }
        }
        if (!vals.length) { results[item.id] = null; continue }

        vals.sort((a, b) => a - b)
        const median = vals.length % 2 === 0
          ? (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2
          : vals[Math.floor(vals.length / 2)]

        results[item.id] = { price: median, sources, name: item.name }
      }
      lastPriceSource = 'pricempire'
      return results
    } catch (e) {
      console.error('[CS2] PriceEmpire failed, falling back to Skinport:', e.message)
    }
  }

  return fetchFromSkinport(items)
}

export async function applyCS2Prices(items, priceResults) {
  const ts = new Date().toISOString()
  const tasks = items
    .filter(item => priceResults[item.id])
    .map(item => {
      const r = priceResults[item.id]
      return updateItem(item.id, {
        value: r.price,
        last_price_fetched_at: ts,
        metadata: { ...item.metadata, price_sources: r.sources },
      }).then(() => ({ name: r.name, price: r.price, sources: r.sources }))
    })
  const applied = await Promise.all(tasks)
  for (const { name, price, sources } of applied) {
    setCache(name, { price, sources })
  }
}

export function getCachedPrice(name) {
  return getCached(name)
}
