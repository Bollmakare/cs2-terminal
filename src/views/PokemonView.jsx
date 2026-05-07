import { useState, useEffect, useMemo } from 'react'
import StatCards from '../components/StatCards.jsx'
import ItemTable from '../components/ItemTable.jsx'
import AddItemModal from '../components/AddItemModal.jsx'
import ImageModal from '../components/ImageModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fmt, pct, fmts, sgn, calcPnl, effectiveValue, downloadCsv, holdDuration, annualizedReturn, ago } from '../lib/utils.js'
import CsvImportModal from '../components/CsvImportModal.jsx'
import SetCompletionPanel from '../components/SetCompletionPanel.jsx'
import { addItem, updateItem, deleteItem } from '../lib/api.js'
import { useToast } from '../components/Toast.jsx'
import ItemLedgerModal from '../components/ItemLedgerModal.jsx'
import SellModal from '../components/SellModal.jsx'
import MoreMenu, { MoreMenuItem } from '../components/MoreMenu.jsx'
import SetGridPanel from '../components/SetGridPanel.jsx'
import PackSimulatorModal from '../components/PackSimulatorModal.jsx'

const PORTFOLIOS = ['brun single', 'green single', 'Single svart', 'Main']
const ITEM_TYPE_LABELS = { card: 'Card', booster_box: 'Booster Box', etb: 'ETB', pack: 'Pack', tin: 'Tin', sealed_other: 'Sealed' }

const IMG_TTL = 7 * 24 * 60 * 60 * 1000

function PokemonCardImage({ setName, cardNumber, onClick }) {
  const num = cardNumber ? String(cardNumber).split('/')[0] : null
  const cacheKey = setName && num
    ? `pkm_img_${setName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${num}`
    : null

  const [src, setSrc] = useState(() => {
    if (!cacheKey) return null
    try {
      const c = localStorage.getItem(cacheKey)
      if (c) { const { ts, url } = JSON.parse(c); if (Date.now() - ts < IMG_TTL) return url }
    } catch {}
    return null
  })

  useEffect(() => {
    if (src || !setName || !num || !cacheKey) return
    const save = url => {
      setSrc(url)
      try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), url })) } catch {}
    }
    // Check grid cache first (populated by SetGridPanel)
    try {
      const grid = localStorage.getItem(`pkm_grid_${setName.toLowerCase().replace(/\s+/g, '_')}`)
      if (grid) {
        const { data } = JSON.parse(grid)
        const normalNum = num.replace(/^0+/, '') || '0'
        const card = data.find(c => (String(c.number).replace(/^0+/, '') || '0') === normalNum || String(c.number) === num)
        if (card?.images?.small) { save(card.images.small); return }
      }
    } catch {}
    // Fallback: single card API call
    fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`set.name:"${setName}" number:${num}`)}&select=id,images&pageSize=1`)
      .then(r => r.json())
      .then(json => { const url = json.data?.[0]?.images?.small; if (url) save(url) })
      .catch(() => {})
  }, [setName, num, cacheKey, src])

  if (!src) return <div className="thumb-placeholder" />
  return <img className="thumb" src={src} alt="" onClick={onClick} style={{ cursor: 'pointer' }} />
}

export default function PokemonView({ items: initItems, userId, onItemsChange }) {
  const toast = useToast()
  const [items, setItems] = useState(initItems ?? [])
  const [modal, setModal] = useState(null)
  const [photoItem, setPhotoItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [ledgerItem, setLedgerItem] = useState(null)
  const [sellItem, setSellItem] = useState(null)
  const [csvImport, setCsvImport] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPortfolio, setFilterPortfolio] = useState('')
  const [filterSet, setFilterSet] = useState('')
  const [filterVariance, setFilterVariance] = useState('')
  const [selected, setSelected] = useState([])
  const [bulkCost, setBulkCost] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [viewMode, setViewMode] = useState('table')
  const [gridSet, setGridSet] = useState('')
  const [packSim, setPackSim] = useState(false)

  useEffect(() => { setItems(initItems ?? []); setSelected([]) }, [initItems])

  const sets = useMemo(() => {
    const s = new Set(items.map(i => i.metadata?.set_name).filter(Boolean))
    return [...s].sort()
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterPortfolio && i.metadata?.portfolio !== filterPortfolio) return false
      if (filterSet && i.metadata?.set_name !== filterSet) return false
      if (filterVariance === 'nocost' && (i.cost ?? 0) > 0) return false
      if (filterVariance === 'noprice' && i.last_price_fetched_at) return false
      if (filterVariance === 'dupes' && i.qty <= 1) return false
      return true
    })
  }, [items, search, filterPortfolio, filterSet, filterVariance])

  const totals = useMemo(() => {
    const value = items.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)
    const cost = items.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0)
    const pnlAbs = value - cost
    const pnlPct = cost > 0 ? (pnlAbs / cost) * 100 : 0
    const best = items.reduce((b, i) => {
      const { pct: p } = calcPnl(i.cost ?? 0, effectiveValue(i))
      return (!b || p > b._pct) ? { ...i, _pct: p } : b
    }, null)
    return { value, cost, pnl: pnlAbs, pct: pnlPct, best }
  }, [items])

  async function handleSave(payload) {
    if (modal.item) {
      const updated = await updateItem(modal.item.id, { ...payload, metadata: { ...modal.item.metadata, ...payload.metadata } })
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
      onItemsChange?.(); toast('Card updated', 'success')
    } else {
      const created = await addItem(payload)
      setItems(prev => [created, ...prev])
      onItemsChange?.(); toast('Card added', 'success')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteItem(deleteTarget.id)
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      onItemsChange?.()
      toast('Card deleted', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  async function applyBulkCost() {
    if (!selected.length || bulkCost === '') return
    const cost = parseFloat(bulkCost)
    if (isNaN(cost)) { toast('Enter a valid number', 'error'); return }
    setBulkSaving(true)
    try {
      const updates = await Promise.all(selected.map(id => updateItem(id, { cost })))
      setItems(prev => prev.map(i => {
        const u = updates.find(u => u.id === i.id)
        return u ? u : i
      }))
      onItemsChange?.()
      setSelected([])
      setBulkCost('')
      toast(`Set cost to ${fmt(cost)} for ${updates.length} cards`, 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBulkSaving(false)
    }
  }

  function handlePhotoUpdate(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    setPhotoItem(updated); onItemsChange?.()
  }

  function exportCsv() {
    const rows = items.map(i => ({
      name: i.name,
      item_type: i.metadata?.item_type ?? 'card',
      set_name: i.metadata?.set_name ?? '',
      card_number: i.metadata?.card_number ?? '',
      rarity: i.metadata?.rarity ?? '',
      condition: i.metadata?.condition ?? '',
      grade: i.metadata?.grade ?? '',
      cert_number: i.metadata?.cert_number ?? '',
      language: i.metadata?.language ?? '',
      portfolio: i.metadata?.portfolio ?? '',
      cost: i.cost,
      value: i.value ?? '',
      qty: i.qty,
      pnl_abs: (effectiveValue(i) - (i.cost ?? 0)) * i.qty,
      pnl_pct: i.cost > 0 ? ((effectiveValue(i) - i.cost) / i.cost * 100).toFixed(2) : '',
      cardmarket_eur: i.metadata?.price_sources?.cardmarket_eur ?? '',
      tcgplayer_usd: i.metadata?.price_sources?.tcgplayer_usd ?? '',
    }))
    downloadCsv(rows, 'vault-pokemon.csv')
  }

  const columns = [
    {
      key: 'name', label: 'Card',
      sortValue: row => row.name,
      render: row => {
        const imgs = row.metadata?.images ?? []
        const apiImg = row.metadata?.card_image
        return (
          <div className="item-name-cell">
            {imgs[0]
              ? <img className="thumb" src={imgs[0]} alt="" onClick={() => setPhotoItem(row)} />
              : apiImg
                ? <img className="thumb" src={apiImg} alt="" onClick={() => setPhotoItem(row)} style={{ cursor: 'pointer' }} />
                : <PokemonCardImage
                    setName={row.metadata?.set_name}
                    cardNumber={row.metadata?.card_number}
                    onClick={() => setPhotoItem(row)}
                  />}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                {row.metadata?.card_url
                  ? <a href={row.metadata.card_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline dotted' }}>{row.name}</a>
                  : <span>{row.name}</span>}
                {row.metadata?.subtypes && <span style={{ fontSize: 10, color: 'var(--mut)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>{row.metadata.subtypes}</span>}
                {row.metadata?.card_types && <span style={{ fontSize: 10, color: 'var(--pkm)', background: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: 3, padding: '1px 5px' }}>{row.metadata.card_types}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mut)' }}>
                {row.metadata?.set_name}{row.metadata?.card_series ? ` (${row.metadata.card_series})` : ''}{row.metadata?.card_number ? ` · #${row.metadata.card_number}` : ''}
                {row.metadata?.rarity ? ` · ${row.metadata.rarity}` : ''}
              </div>
              {row.metadata?.release_date && (
                <div style={{ fontSize: 10, color: 'var(--mut)' }}>📅 {row.metadata.release_date}</div>
              )}
              {row.metadata?.artist && (
                <div style={{ fontSize: 10, color: 'var(--mut)' }}>✏️ {row.metadata.artist}</div>
              )}
              {row.metadata?.cert_number && (
                <div style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'JetBrains Mono' }}>
                  Cert #{row.metadata.cert_number}
                </div>
              )}
              {row.metadata?.grading_status === 'submitted' && (
                <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 2 }}>
                  📬 At {row.metadata.grading_service ?? 'PSA'}
                  {row.metadata?.expected_return
                    ? ` · due ${new Date(row.metadata.expected_return).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`
                    : ''}
                </div>
              )}
            </div>
          </div>
        )
      }
    },
    {
      key: 'type', label: 'Type',
      sortValue: row => row.metadata?.item_type ?? '',
      render: row => {
        const t = row.metadata?.item_type ?? 'card'
        return <span className={`badge ${t === 'card' ? 'badge-card' : 'badge-sealed'}`}>{ITEM_TYPE_LABELS[t] ?? t}</span>
      }
    },
    {
      key: 'collection', label: 'Collection',
      sortValue: row => row.metadata?.portfolio ?? '',
      render: row => {
        const p = row.metadata?.portfolio
        if (!p) return <span style={{ color: 'var(--mut)' }}>—</span>
        const colors = { 'brun single': '#c9a84c', 'green single': '#4caf50', 'Single svart': '#9e9e9e', 'Main': '#2196f3' }
        return <span style={{ fontSize: 11, background: 'var(--bg3)', border: `1px solid ${colors[p] ?? 'var(--border)'}`, color: colors[p] ?? 'var(--txt)', borderRadius: 4, padding: '2px 7px' }}>{p}</span>
      }
    },
    {
      key: 'release', label: 'Released',
      sortValue: row => row.metadata?.release_date ?? '',
      render: row => {
        const rd = row.metadata?.release_date
        if (!rd) return <span style={{ color: 'var(--mut)', fontSize: 12 }}>—</span>
        const [year, month] = rd.split('-')
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const label = month ? `${monthNames[parseInt(month)-1]} ${year}` : year
        return <span style={{ fontSize: 12, color: 'var(--mut)' }}>{label}</span>
      }
    },
    { key: 'qty', label: 'Qty', sortValue: row => row.qty, render: row => <span className="mono">{row.qty}</span> },
    { key: 'cost', label: 'Cost', sortValue: row => row.cost ?? 0, render: row => <span className="mono">{fmt(row.cost)}</span> },
    {
      key: 'value', label: 'Value',
      sortValue: row => effectiveValue(row),
      render: row => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono">{fmt(effectiveValue(row))}</span>
          {row.last_price_fetched_at
            ? <span className="badge badge-auto" title={`Fetched ${ago(row.last_price_fetched_at)}`}>AUTO · {ago(row.last_price_fetched_at)}</span>
            : <span className="badge badge-manual">MANUAL</span>}
        </div>
      )
    },
    {
      key: 'pnl', label: 'P&L',
      sortValue: row => calcPnl(row.cost ?? 0, effectiveValue(row), row.qty).abs,
      render: row => {
        const { abs, pct: p } = calcPnl(row.cost ?? 0, effectiveValue(row), row.qty)
        return (
          <div>
            <span className={`pnl-chip ${sgn(abs)}`}>{pct(p)}</span>
            <div className="mono" style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>{fmts(abs)}</div>
          </div>
        )
      }
    },
  ]

  const statCards = [
    { label: 'Total Value', value: fmt(totals.value) },
    { label: 'Invested', value: fmt(totals.cost) },
    { label: 'P&L', value: `${pct(totals.pct)} ${fmts(totals.pnl)}`, colorClass: sgn(totals.pnl) },
    { label: 'Best Card', value: totals.best?.name ?? '—', sub: totals.best ? pct(totals.best._pct) : '' },
  ]

  return (
    <div>
      <div className="view-header">
        <div className="view-title" style={{ color: 'var(--pkm)' }}>Pokémon TCG</div>
        <div className="view-actions">
          <button
            className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
            style={viewMode === 'grid' ? { background: 'var(--pkm)', color: '#000' } : {}}
            onClick={() => setViewMode(v => v === 'grid' ? 'table' : 'grid')}
          >
            ⊞ {viewMode === 'grid' ? 'Table' : 'Grid'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>↓ CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCsvImport(true)}>↑ Import</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPackSim(true)}>📦 Open Packs</button>
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--pkm)', color: '#000' }} onClick={() => setModal({ item: null })}>
            + Add Card
          </button>
        </div>
      </div>

      <StatCards cards={statCards} />

      <SetCompletionPanel items={items} />

      {viewMode === 'grid' && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', fontWeight: 600 }}>Set Grid</span>
            <select
              className="filter-select"
              value={gridSet}
              onChange={e => setGridSet(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">— Select a set —</option>
              {sets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <SetGridPanel
            items={items}
            setName={gridSet}
            onAddCard={card => setModal({
              item: null,
              prefill: { name: card.name, set_name: gridSet, card_number: card.number }
            })}
          />
        </div>
      )}

      <div className="filters-row">
        <input
          className="search-input"
          placeholder="Search cards…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterPortfolio} onChange={e => setFilterPortfolio(e.target.value)}>
          <option value="">All portfolios</option>
          {PORTFOLIOS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" value={filterSet} onChange={e => setFilterSet(e.target.value)}>
          <option value="">All sets</option>
          {sets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={filterVariance} onChange={e => setFilterVariance(e.target.value)}>
          <option value="">All</option>
          <option value="nocost">Missing cost</option>
          <option value="noprice">No auto-price</option>
          <option value="dupes">Duplicates (qty &gt; 1)</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 'auto' }}>{filtered.length} / {items.length}</span>
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{selected.length} selected</span>
          <span style={{ color: 'var(--mut)', fontSize: 13 }}>Set cost:</span>
          <input
            className="bulk-input"
            type="number"
            step="0.01"
            min="0"
            placeholder="€0.00"
            value={bulkCost}
            onChange={e => setBulkCost(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={applyBulkCost} disabled={bulkSaving || bulkCost === ''}>
            {bulkSaving ? <span className="loading-spin" /> : 'Apply'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <ItemTable
        columns={columns}
        rows={filtered}
        selectable
        selected={selected}
        onSelectChange={setSelected}
        onEdit={item => setModal({ item })}
        onDelete={item => setDeleteTarget(item)}
        onPhoto={item => setPhotoItem(item)}
        extraActions={row => (
          <>
            <button className="btn-icon" title="Record sale" onClick={() => setSellItem(row)}>💰</button>
            {(row.metadata?.item_type && row.metadata.item_type !== 'card')
              ? <button className="btn-icon" title="Find price on PriceCharting" onClick={() => {
                  const q = encodeURIComponent(row.name)
                  window.open(`https://www.pricecharting.com/search-products?q=${q}&type=prices`, '_blank')
                }}>🔍</button>
              : <button className="btn-icon" title="View on pokemoncard.io" onClick={() => {
                  const q = [row.name, row.metadata?.set_name, row.metadata?.card_number].filter(Boolean).join(' ')
                  window.open(`https://pokemoncard.io/?q=${encodeURIComponent(q)}`, '_blank')
                }}>🔗</button>}
            <MoreMenu>
              <MoreMenuItem onClick={() => setLedgerItem(row)}>📓 Notebook</MoreMenuItem>
            </MoreMenu>
          </>
        )}
        emptyMessage={filtered.length === 0 && items.length > 0 ? 'No cards match your filters.' : 'No Pokémon cards added yet.'}
      />

      {modal && (
        <AddItemModal
          vertical="pokemon"
          item={modal.item}
          prefill={modal.prefill}
          userId={userId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {photoItem && (
        <ImageModal
          item={photoItem}
          userId={userId}
          onClose={() => setPhotoItem(null)}
          onUpdate={handlePhotoUpdate}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete card"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          dangerous
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {ledgerItem && (
        <ItemLedgerModal
          item={ledgerItem}
          onClose={() => setLedgerItem(null)}
          onItemUpdate={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
            setLedgerItem(updated)
          }}
        />
      )}

      {csvImport && (
        <CsvImportModal
          vertical="pokemon"
          userId={userId}
          onClose={() => setCsvImport(false)}
          onImported={newItems => {
            setItems(prev => [...newItems, ...prev])
            setCsvImport(false)
            onItemsChange?.()
          }}
        />
      )}

      {sellItem && (
        <SellModal
          item={sellItem}
          userId={userId}
          onClose={() => setSellItem(null)}
          onSold={remaining => {
            if (remaining <= 0) {
              setItems(prev => prev.filter(i => i.id !== sellItem.id))
            } else {
              setItems(prev => prev.map(i => i.id === sellItem.id ? { ...i, qty: remaining } : i))
            }
            setSellItem(null)
            onItemsChange?.()
          }}
        />
      )}

      {packSim && (
        <PackSimulatorModal
          sets={sets}
          onClose={() => setPackSim(false)}
        />
      )}
    </div>
  )
}
