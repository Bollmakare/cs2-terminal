import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getSession, onAuthChange } from './lib/auth.js'
import { getItems, getSnapshotHistory, getTodaySnapshot, addPriceHistory } from './lib/api.js'
import { effectiveValue } from './lib/utils.js'
import { fetchCS2Prices, applyCS2Prices, isAnyStale, lastPriceSource } from './lib/pricing/cs2.js'
import { fetchAllPokemonPrices, applyPokemonPrices, isAnyPokemonStale } from './lib/pricing/pokemon.js'
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
import FunView from './views/FunView.jsx'

export default function App() {
  const toast = useToast()
  const [session, setSession] = useState(undefined)
  const [items, setItems] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [cs2Status, setCS2Status] = useState('idle')
  const [pkmnStatus, setPkmnStatus] = useState('idle')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    getSession().then(s => {
      setSession(s)
      if (!s) setLoading(false)
    })
    return onAuthChange(s => setSession(s))
  }, [])

  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [all, snaps] = await Promise.all([getItems(), getSnapshotHistory()])
      setItems(all)
      setSnapshots(snaps)

      const cs2Items = all.filter(i => i.vertical === 'cs2')
      if (cs2Items.length && isAnyStale(cs2Items)) {
        refreshCS2(cs2Items)
      } else if (cs2Items.length) {
        const src = lastPriceSource ?? 'skinport'
        setCS2Status(src === 'pricempire' ? 'ok' : `fallback-${src}`)
      } else {
        setCS2Status('ok')
      }

      const pkmnItems = all.filter(i => i.vertical === 'pokemon')
      if (pkmnItems.length && isAnyPokemonStale(pkmnItems)) {
        refreshPokemon(pkmnItems)
      } else if (pkmnItems.length) {
        setPkmnStatus('ok')
      }

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
    } catch (e) {
      console.warn('Portfolio snapshot failed:', e.message)
    }
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
      const src = lastPriceSource ?? 'skinport'
      setCS2Status(src === 'pricempire' ? 'ok' : `fallback-${src}`)
      toast(`CS2 prices updated via ${src}`, 'success')
    } catch (e) {
      setCS2Status(e.message.includes('limit') ? 'limit' : 'error')
      toast(e.message, 'error')
    }
  }

  async function silentReload() {
    try {
      const all = await getItems()
      setItems(all)
      takeSnapshot(all).catch(() => {})
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function refreshPokemon(pkmItems) {
    const pkmItems2 = pkmItems ?? items.filter(i => i.vertical === 'pokemon')
    if (!pkmItems2.length) return
    setPkmnStatus('loading')
    try {
      const results = await fetchAllPokemonPrices(pkmItems2, (done, total) => {
        if (done % 10 === 0) toast(`Pokémon: ${done}/${total}`, 'info', 1500)
      })
      await applyPokemonPrices(pkmItems2, results)
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
      <div className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <Sidebar user={session.user} netWorth={netWorth} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <StatusBar
          cs2Status={cs2Status}
          pkmnStatus={pkmnStatus}
          onRefreshCS2={() => refreshCS2()}
          onRefreshPkm={refreshPokemon}
          onMenuClick={() => setSidebarOpen(o => !o)}
        />
        <main className="page-content">
          {loading ? (
            <div className="page-loading"><span className="loading-spin" /> Loading portfolio…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard items={items} snapshots={snapshots} user={session.user} />} />
              <Route path="/cs2" element={<CS2View items={cs2Items} userId={userId} onItemsChange={silentReload} />} />
              <Route path="/pokemon" element={<PokemonView items={pokemonItems} userId={userId} onItemsChange={silentReload} />} />
              <Route path="/wine" element={<WineView items={wineItems} userId={userId} onItemsChange={silentReload} />} />
              <Route path="/cellar-log" element={<CellarLogView />} />
              <Route path="/sold" element={<SoldView />} />
              <Route path="/wishlist" element={<WishlistView userId={userId} />} />
              <Route path="/fun" element={<FunView items={items} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  )
}
