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

const PORTFOLIOS = ['brun single', 'green single', 'Single svart', 'Main']
const ITEM_TYPE_LABELS = { card: 'Card', booster_box: 'Booster Box', etb: 'ETB', pack: 'Pack', tin: 'Tin', sealed_other: 'Sealed' }

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
        return (
          <div className="item-name-cell">
            {imgs[0]
              ? <img className="thumb" src={imgs[0]} alt="" onClick={() => setPhotoItem(row)} />
              : <div className="thumb-placeholder" />}
            <div>
              <div>{row.name}</div>
              <div style={{ fontSize: 11, color: 'var(--mut)' }}>
                {row.metadata?.set_name} {row.metadata?.card_number ? `· #${row.metadata.card_number}` : ''}
                {row.metadata?.rarity ? ` · ${row.metadata.rarity}` : ''}
              </div>
              {row.metadata?.cert_number && (
                <div style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'JetBrains Mono' }}>
                  Cert #{row.metadata.cert_number}
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
      key: 'grade', label: 'Condition',
      sortValue: row => row.metadata?.grade ?? row.metadata?.condition ?? '',
      render: row => {
        const g = row.metadata?.grade
        const c = row.metadata?.condition
        return <span style={{ fontSize: 12 }}>{g && g !== 'Ungraded' ? g : c ?? '—'}</span>
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
      key: 'sources', label: 'Sources',
      render: row => {
        const src = row.metadata?.price_sources ?? {}
        if (!src.cardmarket_eur && !src.tcgplayer_usd) return <span style={{ color: 'var(--mut)', fontSize: 12 }}>—</span>
        return (
          <div className="source-chips">
            {src.cardmarket_eur != null && (
              <span className="source-chip active">CM {fmt(src.cardmarket_eur)}</span>
            )}
            {src.tcgplayer_usd != null && (
              <span className="source-chip">TCG ${src.tcgplayer_usd.toFixed(2)}</span>
            )}
          </div>
        )
      }
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
    {
      key: 'held', label: 'Held',
      sortValue: row => new Date(row.created_at).getTime(),
      render: row => {
        const dur = holdDuration(row.created_at)
        const ann = annualizedReturn(row.cost, effectiveValue(row), row.created_at)
        return (
          <div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--mut)' }}>{dur ?? '—'}</div>
            {ann != null && <div className="mono" style={{ fontSize: 11, color: ann >= 0 ? 'var(--grn)' : 'var(--red)' }}>{ann >= 0 ? '+' : ''}{ann.toFixed(1)}%/yr</div>}
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
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>↓ CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCsvImport(true)}>↑ Import</button>
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--pkm)', color: '#000' }} onClick={() => setModal({ item: null })}>
            + Add Card
          </button>
        </div>
      </div>

      <StatCards cards={statCards} />

      <SetCompletionPanel items={items} />

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
    </div>
  )
}
