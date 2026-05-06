import { useState, useEffect, useMemo } from 'react'
import StatCards from '../components/StatCards.jsx'
import ItemTable from '../components/ItemTable.jsx'
import AddItemModal from '../components/AddItemModal.jsx'
import ImageModal from '../components/ImageModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import WinePriceModal from '../components/WinePriceModal.jsx'
import ConsumeModal from '../components/ConsumeModal.jsx'
import ItemLedgerModal from '../components/ItemLedgerModal.jsx'
import { fmt, pct, fmts, sgn, calcPnl, effectiveValue, downloadCsv, holdDuration, annualizedReturn } from '../lib/utils.js'
import CsvImportModal from '../components/CsvImportModal.jsx'
import { addItem, updateItem, deleteItem } from '../lib/api.js'
import { openWineSearcher } from '../lib/pricing/wine.js'
import { useToast } from '../components/Toast.jsx'
import MoreMenu, { MoreMenuItem } from '../components/MoreMenu.jsx'

export default function WineView({ items: initItems, userId, onItemsChange }) {
  const toast = useToast()
  const [items, setItems] = useState(initItems ?? [])
  const [modal, setModal] = useState(null)
  const [photoItem, setPhotoItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [priceItem, setPriceItem] = useState(null)
  const [consumeItem, setConsumeItem] = useState(null)
  const [ledgerItem, setLedgerItem] = useState(null)
  const [csvImport, setCsvImport] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRegion, setFilterRegion] = useState('')
  const [filterFormat, setFilterFormat] = useState('')
  const [selected, setSelected] = useState([])
  const [bulkCost, setBulkCost] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => { setItems(initItems ?? []); setSelected([]) }, [initItems])

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

  const regions = useMemo(() => {
    const s = new Set(items.map(i => i.metadata?.region).filter(Boolean))
    return [...s].sort()
  }, [items])

  const formats = useMemo(() => {
    const s = new Set(items.map(i => i.metadata?.format).filter(Boolean))
    return [...s].sort()
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterRegion && i.metadata?.region !== filterRegion) return false
      if (filterFormat && i.metadata?.format !== filterFormat) return false
      return true
    })
  }, [items, search, filterRegion, filterFormat])

  async function applyBulkCost() {
    if (!selected.length || bulkCost === '') return
    const cost = parseFloat(bulkCost)
    if (isNaN(cost)) { toast('Enter a valid number', 'error'); return }
    setBulkSaving(true)
    try {
      const updates = await Promise.all(selected.map(id => updateItem(id, { cost })))
      setItems(prev => prev.map(i => { const u = updates.find(u => u.id === i.id); return u ?? i }))
      onItemsChange?.()
      setSelected([])
      setBulkCost('')
      toast(`Set cost to ${fmt(cost)} for ${updates.length} bottles`, 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleSave(payload) {
    if (modal.item) {
      const updated = await updateItem(modal.item.id, { ...payload, metadata: { ...modal.item.metadata, ...payload.metadata } })
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
      onItemsChange?.(); toast('Bottle updated', 'success')
    } else {
      const created = await addItem(payload)
      setItems(prev => [created, ...prev])
      onItemsChange?.(); toast('Bottle added', 'success')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteItem(deleteTarget.id)
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      onItemsChange?.()
      toast('Bottle deleted', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  function handlePhotoUpdate(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    setPhotoItem(updated); onItemsChange?.()
  }

  function exportCsv() {
    const rows = items.map(i => ({
      name: i.name,
      producer: i.metadata?.producer ?? '',
      vintage: i.metadata?.vintage ?? '',
      appellation: i.metadata?.appellation ?? '',
      region: i.metadata?.region ?? '',
      format: i.metadata?.format ?? '',
      lot_number: i.metadata?.lot_number ?? '',
      bin_location: i.metadata?.bin_location ?? '',
      drink_from: i.metadata?.drink_from ?? '',
      drink_to: i.metadata?.drink_to ?? '',
      cost: i.cost,
      value: effectiveValue(i),
      qty: i.qty,
      pnl_abs: (effectiveValue(i) - (i.cost ?? 0)) * i.qty,
      pnl_pct: i.cost > 0 ? ((effectiveValue(i) - i.cost) / i.cost * 100).toFixed(2) : '',
      storage_notes: i.metadata?.storage_notes ?? '',
    }))
    downloadCsv(rows, 'vault-wine.csv')
  }

  const columns = [
    {
      key: 'name', label: 'Wine',
      sortValue: row => row.name,
      render: row => (
        <div className="item-name-cell">
          {row.metadata?.images?.[0]
            ? <img className="thumb" src={row.metadata.images[0]} alt="" onClick={() => setPhotoItem(row)} />
            : <div className="thumb-placeholder" />}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{row.name}</span>
              {row.metadata?.critic_score && (
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--gold)', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 3, padding: '1px 5px' }}>
                  ★ {row.metadata.critic_score}
                </span>
              )}
            </div>
            {row.metadata?.bin_location && (
              <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>📍 {row.metadata.bin_location}</div>
            )}
            {row.metadata?.purchase_source && (
              <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 1 }}>from {row.metadata.purchase_source}</div>
            )}
          </div>
        </div>
      )
    },
    { key: 'producer', label: 'Producer', sortValue: row => row.metadata?.producer ?? '', render: row => row.metadata?.producer ?? '—' },
    {
      key: 'vintage', label: 'Vintage',
      sortValue: row => row.metadata?.vintage ?? 0,
      render: row => {
        const v = row.metadata?.vintage
        const from = row.metadata?.drink_from
        const to = row.metadata?.drink_to
        return (
          <div>
            <span className="mono">{v ?? '—'}</span>
            {(from || to) && (
              <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 1 }}>
                Drink {from ?? '?'}–{to ?? '?'}
              </div>
            )}
          </div>
        )
      }
    },
    {
      key: 'region', label: 'Region',
      render: row => (
        <div>
          <div>{row.metadata?.region ?? '—'}</div>
          {row.metadata?.appellation && (
            <div style={{ fontSize: 11, color: 'var(--mut)' }}>{row.metadata.appellation}</div>
          )}
        </div>
      )
    },
    { key: 'format', label: 'Format', sortValue: row => row.metadata?.format ?? '', render: row => row.metadata?.format ?? '—' },
    { key: 'qty', label: 'Qty', sortValue: row => row.qty, render: row => <span className="mono">{row.qty}</span> },
    { key: 'cost', label: 'Cost', sortValue: row => row.cost ?? 0, render: row => <span className="mono">{fmt(row.cost)}</span> },
    { key: 'value', label: 'Value', sortValue: row => effectiveValue(row), render: row => <span className="mono">{fmt(effectiveValue(row))}</span> },
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
    { label: 'Best Bottle', value: totals.best?.name ?? '—', sub: totals.best ? pct(totals.best._pct) : '' },
  ]

  return (
    <div>
      <div className="view-header">
        <div className="view-title" style={{ color: 'var(--wine)' }}>Wine Cellar</div>
        <div className="view-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>↓ CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCsvImport(true)}>↑ Import</button>
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--wine)' }} onClick={() => setModal({ item: null })}>
            + Add Bottle
          </button>
        </div>
      </div>

      <StatCards cards={statCards} />

      <div className="filters-row">
        <input
          className="search-input"
          placeholder="Search wines…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
          <option value="">All regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={filterFormat} onChange={e => setFilterFormat(e.target.value)}>
          <option value="">All formats</option>
          {formats.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 'auto' }}>{filtered.length} / {items.length}</span>
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{selected.length} selected</span>
          <span style={{ color: 'var(--mut)', fontSize: 13 }}>Set cost:</span>
          <input className="bulk-input" type="number" step="0.01" min="0" placeholder="€0.00" value={bulkCost} onChange={e => setBulkCost(e.target.value)} />
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--wine)' }} onClick={applyBulkCost} disabled={bulkSaving || bulkCost === ''}>
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
            <button className="btn-icon" title="Price history" onClick={() => setPriceItem(row)}>📈</button>
            <button className="btn-icon" title="Open a bottle" onClick={() => setConsumeItem(row)}>🍷</button>
            <MoreMenu>
              <MoreMenuItem onClick={() => setLedgerItem(row)}>📓 Notebook</MoreMenuItem>
              <MoreMenuItem onClick={() => openWineSearcher(row.name, row.metadata?.vintage, row.metadata?.producer)}>🔍 Wine-Searcher</MoreMenuItem>
            </MoreMenu>
          </>
        )}
        emptyMessage={filtered.length === 0 && items.length > 0 ? 'No wines match your filters.' : 'No wine bottles added yet.'}
      />

      {modal && (
        <AddItemModal
          vertical="wine"
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
          title="Delete bottle"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          dangerous
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {priceItem && (
        <WinePriceModal
          item={priceItem}
          userId={userId}
          onClose={() => setPriceItem(null)}
          onItemUpdate={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
            setPriceItem(updated)
          }}
        />
      )}

      {csvImport && (
        <CsvImportModal
          vertical="wine"
          userId={userId}
          onClose={() => setCsvImport(false)}
          onImported={newItems => {
            setItems(prev => [...newItems, ...prev])
            setCsvImport(false)
            onItemsChange?.()
          }}
        />
      )}

      {consumeItem && (
        <ConsumeModal
          item={consumeItem}
          userId={userId}
          onClose={() => setConsumeItem(null)}
          onConsumed={remaining => {
            if (remaining <= 0) {
              setItems(prev => prev.filter(i => i.id !== consumeItem.id))
            } else {
              setItems(prev => prev.map(i => i.id === consumeItem.id ? { ...i, qty: remaining } : i))
            }
            setConsumeItem(null)
            onItemsChange?.()
          }}
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
    </div>
  )
}
