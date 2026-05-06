import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getSession, onAuthChange } from './lib/auth.js'
import { getItems, getSnapshotHistory, getTodaySnapshot, addPriceHistory, getApiUsage } from './lib/api.js'
import { effectiveValue } from './lib/utils.js'
import { fetchCS2Prices, applyCS2Prices, isAnyStale, syncLocalUsageFromDb } from './lib/pricing/cs2.js'
import { fetchAllPokemonPrices, applyPokemonPrices } from './lib/pricing/pokemon.js'
import AuthScreen from './components/AuthScreen.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatusBar from './components/StatusBar.jsx'
import { useToast } from './components/Toast.jsx'
import Dashboard from './views/Dashboard.jsx'
import CS2View from './views/CS2View.jsx'
import PokemonView from './views/PokemonView.jsx'
import WineView from './views/WineView.jsx'
import CellarLogView from './views/CellarLogView.jsx'
import SoldView from './views/SoldView.jsx'
import WishlistView from './views/WishlistView.jsx'

export default function App() {
  const toast = useToast()
  const [session, setSession] = useState(undefined)
  const [items, setItems] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [cs2Status, setCS2Status] = useState('idle')
  const [pkmnStatus, setPkmnStatus] = useState('idle')
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    getSession().then(s => {
      setSession(s)
      if (!s) setLoading(false)
    })
    return onAuthChange(s => setSession(s))
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const u = await getApiUsage()
      setUsage(u)
      syncLocalUsageFromDb(u)
    } catch {}
  }, [])

  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [all, snaps] = await Promise.all([getItems(), getSnapshotHistory()])
      setItems(all)
      setSnapshots(snaps)

      await loadUsage()

      const cs2Items = all.filter(i => i.vertical === 'cs2')
      if (cs2Items.length && isAnyStale(cs2Items)) {
        refreshCS2(cs2Items)
      } else {
        setCS2Status('ok')
      }

      if (all.filter(i => i.vertical === 'pokemon').length) setPkmnStatus('ok')

      await takeSnapshot(all)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) loadData()
    else setLoading(false)
  }, [session])

  async function takeSnapshot(allItems) {
    try {
      const existing = await getTodaySnapshot()
      if (existing) return
      const total = allItems.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)
      if (total <= 0) return
      await addPriceHistory({ item_id: null, price: total, source: 'snapshot', user_id: session?.user?.id ?? null })
      const snaps = await getSnapshotHistory()
      setSnapshots(snaps)
    } catch {}
  }

  async function refreshCS2(cs2Items) {
    const its = cs2Items ?? items.filter(i => i.vertical === 'cs2')
    if (!its.length) return
    setCS2Status('loading')
    try {
      const results = await fetchCS2Prices(its, session?.user?.id)
      await applyCS2Prices(its, results)
      const fresh = await getItems('cs2')
      setItems(prev => {
        const map = Object.fromEntries(fresh.map(i => [i.id, i]))
        return prev.map(i => map[i.id] ?? i)
      })
      setCS2Status('ok')
      toast('CS2 prices updated', 'success')
      loadUsage()
    } catch (e) {
      setCS2Status(e.message.includes('limit') ? 'limit' : 'error')
      toast(e.message, 'error')
    }
  }

  async function refreshPokemon() {
    const pkmItems = items.filter(i => i.vertical === 'pokemon')
    if (!pkmItems.length) return
    setPkmnStatus('loading')
    try {
      const results = await fetchAllPokemonPrices(pkmItems, (done, total) => {
        if (done % 10 === 0) toast(`Pokémon: ${done}/${total}`, 'info', 1500)
      })
      await applyPokemonPrices(pkmItems, results)
      const fresh = await getItems('pokemon')
      setItems(prev => {
        const map = Object.fromEntries(fresh.map(i => [i.id, i]))
        return prev.map(i => map[i.id] ?? i)
      })
      setPkmnStatus('ok')
      toast('Pokémon prices updated', 'success')
    } catch (e) {
      setPkmnStatus('error')
      toast(e.message, 'error')
    }
  }

  const netWorth = items.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)

  if (session === undefined) {
    return <div className="page-loading"><span className="loading-spin" /> Loading…</div>
  }
  if (!session) return <AuthScreen />

  const cs2Items = items.filter(i => i.vertical === 'cs2')
  const pokemonItems = items.filter(i => i.vertical === 'pokemon')
  const wineItems = items.filter(i => i.vertical === 'wine')
  const userId = session.user.id

  return (
    <div className="app-layout">
      <Sidebar user={session.user} netWorth={netWorth} />
      <div className="main-area">
        <StatusBar
          cs2Status={cs2Status}
          pkmnStatus={pkmnStatus}
          usage={usage}
          onRefreshCS2={() => refreshCS2()}
          onRefreshPkm={refreshPokemon}
        />
        <main className="page-content">
          {loading ? (
            <div className="page-loading"><span className="loading-spin" /> Loading portfolio…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard items={items} snapshots={snapshots} user={session.user} />} />
              <Route path="/cs2" element={<CS2View items={cs2Items} userId={userId} onItemsChange={loadData} />} />
              <Route path="/pokemon" element={<PokemonView items={pokemonItems} userId={userId} onItemsChange={loadData} />} />
              <Route path="/wine" element={<WineView items={wineItems} userId={userId} onItemsChange={loadData} />} />
              <Route path="/cellar-log" element={<CellarLogView />} />
              <Route path="/sold" element={<SoldView />} />
              <Route path="/wishlist" element={<WishlistView userId={userId} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  )
}
