import { useState, useEffect, useMemo } from 'react'
import StatCards from '../components/StatCards.jsx'
import ItemTable from '../components/ItemTable.jsx'
import AddItemModal from '../components/AddItemModal.jsx'
import ImageModal from '../components/ImageModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fmt, pct, fmts, sgn, calcPnl, effectiveValue, downloadCsv, holdDuration, annualizedReturn, ago } from '../lib/utils.js'
import CsvImportModal from '../components/CsvImportModal.jsx'
import { addItem, updateItem, deleteItem } from '../lib/api.js'
import { useToast } from '../components/Toast.jsx'
import ItemLedgerModal from '../components/ItemLedgerModal.jsx'
import SellModal from '../components/SellModal.jsx'
import MoreMenu, { MoreMenuItem } from '../components/MoreMenu.jsx'

const WEAR_COLOR = { FN: 'badge-fn', MW: 'badge-mw', FT: 'badge-ft', WW: 'badge-ww', BS: 'badge-bs' }
const WEAR_RANGES = { FN: [0, 0.07], MW: [0.07, 0.15], FT: [0.15, 0.38], WW: [0.38, 0.45], BS: [0.45, 1.0] }

export default function CS2View({ items: initItems, userId, onItemsChange }) {
  const toast = useToast()
  const [items, setItems] = useState(initItems ?? [])
  const [modal, setModal] = useState(null)
  const [photoItem, setPhotoItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [ledgerItem, setLedgerItem] = useState(null)
  const [sellItem, setSellItem] = useState(null)
  const [csvImport, setCsvImport] = useState(false)
  const [search, setSearch] = useState('')
  const [filterWear, setFilterWear] = useState('')
  const [filterST, setFilterST] = useState('')
  const [groupView, setGroupView] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
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

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterWear && i.metadata?.wear !== filterWear) return false
      if (filterST === 'yes' && !i.metadata?.stattrak) return false
      if (filterST === 'no' && i.metadata?.stattrak) return false
      return true
    })
  }, [items, search, filterWear, filterST])

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
      toast(`Set cost to ${fmt(cost)} for ${updates.length} skins`, 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBulkSaving(false)
    }
  }

  function toggleGroup(key) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const displayRows = useMemo(() => {
    if (!groupView) return filtered

    const groupMap = new Map()
    const orderedKeys = []

    for (const item of filtered) {
      const key = `${item.name}||${item.metadata?.wear ?? ''}||${item.metadata?.stattrak ? '1' : '0'}`
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, items: [] })
        orderedKeys.push(key)
      }
      groupMap.get(key).items.push(item)
    }

    const flat = []
    for (const k of orderedKeys) {
      const { items: its, key } = groupMap.get(k)
      if (its.length === 1) {
        flat.push(its[0])
      } else {
        const totalQty = its.reduce((s, i) => s + i.qty, 0)
        const totalCostAbs = its.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0)
        const totalVal = its.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)
        flat.push({
          _isGroup: true,
          _groupKey: key,
          _groupCount: its.length,
          id: `group-${key}`,
          name: its[0].name,
          metadata: { wear: its[0].metadata?.wear, stattrak: its[0].metadata?.stattrak },
          qty: totalQty,
          cost: totalQty > 0 ? totalCostAbs / totalQty : 0,
          value: totalQty > 0 ? totalVal / totalQty : 0,
          last_price_fetched_at: its.some(i => i.last_price_fetched_at) ? true : null,
        })
        if (expandedGroups.has(key)) {
          its.forEach(i => flat.push({ ...i, _isSubRow: true }))
        }
      }
    }
    return flat
  }, [filtered, groupView, expandedGroups])

  async function handleSave(payload) {
    if (modal.item) {
      const updated = await updateItem(modal.item.id, { ...payload, metadata: { ...modal.item.metadata, ...payload.metadata } })
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
      onItemsChange?.()
      toast('Skin updated', 'success')
    } else {
      const created = await addItem(payload)
      setItems(prev => [created, ...prev])
      onItemsChange?.()
      toast('Skin added', 'success')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteItem(deleteTarget.id)
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      onItemsChange?.()
      toast('Skin deleted', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  function handlePhotoUpdate(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    setPhotoItem(updated)
    onItemsChange?.()
  }

  function exportCsv() {
    const rows = items.map(i => ({
      name: i.name,
      wear: i.metadata?.wear ?? '',
      float: i.metadata?.float ?? '',
      stattrak: i.metadata?.stattrak ? 'Yes' : 'No',
      cost: i.cost,
      value: i.value ?? '',
      qty: i.qty,
      pnl_abs: (effectiveValue(i) - (i.cost ?? 0)) * i.qty,
      pnl_pct: i.cost > 0 ? ((effectiveValue(i) - i.cost) / i.cost * 100).toFixed(2) : '',
      notes: i.metadata?.notes ?? '',
    }))
    downloadCsv(rows, 'vault-cs2.csv')
  }

  const columns = [
    {
      key: 'name', label: 'Skin',
      sortValue: row => row.name,
      render: row => (
        <div className="item-name-cell">
          {row._isGroup
            ? <div className="thumb-placeholder" style={{ opacity: 0.3 }} />
            : row.metadata?.images?.[0]
              ? <img className="thumb" src={row.metadata.images[0]} alt="" onClick={() => setPhotoItem(row)} />
              : <div className="thumb-placeholder" />}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span>{row.name}</span>
              {row.metadata?.stattrak && <span className="badge badge-sttrack" style={{ fontSize: 9 }}>ST</span>}
              {row._isGroup && <span style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'JetBrains Mono' }}>{row._groupCount} lots</span>}
              {!row._isGroup && (() => {
                const tl = row.metadata?.trade_lock_until
                if (!tl) return null
                const days = Math.ceil((new Date(tl) - Date.now()) / 86400000)
                if (days <= 0) return null
                return <span style={{ fontSize: 9, color: 'var(--mut)', fontFamily: 'JetBrains Mono', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>🔒 {days}d</span>
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 1 }}>
              {!row._isGroup && row.metadata?.pattern != null && (
                <span style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'JetBrains Mono' }}>#{row.metadata.pattern}</span>
              )}
              {!row._isGroup && row.metadata?.inspect_link && (
                <a
                  href={row.metadata.inspect_link}
                  title="Inspect in game"
                  style={{ fontSize: 10, color: 'var(--cs)', textDecoration: 'none', opacity: 0.7 }}
                  onClick={e => e.stopPropagation()}
                >
                  🔍 Inspect
                </a>
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'wear', label: 'Wear',
      sortValue: row => row.metadata?.wear ?? '',
      render: row => row.metadata?.wear
        ? <span className={`badge ${WEAR_COLOR[row.metadata.wear] ?? ''}`}>{row.metadata.wear}</span>
        : '—'
    },
    {
      key: 'float', label: 'Float',
      sortValue: row => row.metadata?.float ?? Infinity,
      render: row => {
        const fv = row.metadata?.float
        if (fv == null) return '—'
        const range = WEAR_RANGES[row.metadata?.wear]
        const pos = range ? ((fv - range[0]) / (range[1] - range[0])) * 100 : null
        return (
          <div>
            <span className={`mono ${fv < 0.1 ? 'float-low' : ''}`}>{Number(fv).toFixed(4)}</span>
            {pos != null && (
              <div style={{ width: 44, height: 3, background: 'var(--bg3)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pos, 100)}%`, background: pos < 25 ? 'var(--grn)' : 'var(--mut)', borderRadius: 2 }} />
              </div>
            )}
          </div>
        )
      }
    },
    { key: 'qty', label: 'Qty', sortValue: row => row.qty, render: row => <span className="mono">{row.qty}</span> },
    {
      key: 'cost', label: 'Cost',
      sortValue: row => row.cost ?? 0,
      render: row => (
        <span className="mono">
          {fmt(row.cost)}
          {row._isGroup && <span style={{ fontSize: 9, color: 'var(--mut)', marginLeft: 3 }}>avg</span>}
        </span>
      )
    },
    {
      key: 'value', label: 'Market Value',
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
        const keys = Object.keys(src)
        if (!keys.length) return <span style={{ color: 'var(--mut)', fontSize: 12 }}>—</span>
        const vals = Object.values(src)
        const median = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)]
        return (
          <div className="source-chips">
            {keys.map(k => (
              <span key={k} className={`source-chip ${Math.abs(src[k] - median) < 0.01 ? 'active' : ''}`}>
                {k}: {fmt(src[k])}
              </span>
            ))}
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
      sortValue: row => row.created_at ? new Date(row.created_at).getTime() : 0,
      render: row => {
        if (row._isGroup) return <span style={{ color: 'var(--mut)', fontSize: 12 }}>—</span>
        const dur = holdDuration(row.created_at)
        const ann = annualizedReturn(row.cost, effectiveValue(row), row.created_at)
        return (
          <div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--mut)' }}>{dur ?? '—'}</div>
            {ann != null && <div className="mono" style={{ fontSize: 11, color: ann >= 0 ? 'var(--grn)' : 'var(--red)' }}>{ann >= 0 ? '+' : ''}{ann.toFixed(1)}%/yr</div>}
            {row.updated_at && <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 2 }} title={new Date(row.updated_at).toLocaleString()}>↻ {ago(row.updated_at)}</div>}
          </div>
        )
      }
    },
  ]

  const statCards = [
    { label: 'Total Value', value: fmt(totals.value) },
    { label: 'Invested', value: fmt(totals.cost) },
    { label: 'P&L', value: `${pct(totals.pct)} ${fmts(totals.pnl)}`, colorClass: sgn(totals.pnl) },
    { label: 'Best Skin', value: totals.best?.name ? totals.best.name.split('|')[1]?.trim() ?? totals.best.name : '—', sub: totals.best ? `${pct(totals.best._pct)}` : '' },
  ]

  return (
    <div>
      <div className="view-header">
        <div className="view-title" style={{ color: 'var(--cs)' }}>CS2 Skins</div>
        <div className="view-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>↓ CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCsvImport(true)}>↑ Import</button>
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--cs)' }} onClick={() => setModal({ item: null })}>
            + Add Skin
          </button>
        </div>
      </div>

      <StatCards cards={statCards} />

      <div className="filters-row">
        <input
          className="search-input"
          placeholder="Search skins…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterWear} onChange={e => setFilterWear(e.target.value)}>
          <option value="">All wear</option>
          {['FN', 'MW', 'FT', 'WW', 'BS'].map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select className="filter-select" value={filterST} onChange={e => setFilterST(e.target.value)}>
          <option value="">All types</option>
          <option value="yes">StatTrak only</option>
          <option value="no">Non-ST only</option>
        </select>
        <button
          className={`btn btn-sm ${groupView ? 'btn-primary' : 'btn-secondary'}`}
          style={groupView ? { background: 'var(--cs)' } : {}}
          onClick={() => { setGroupView(v => !v); setExpandedGroups(new Set()); setSelected([]) }}
          title="Group skins by name + wear into collapsible rows"
        >
          ◈ {groupView ? 'Grouped' : 'Group'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 'auto' }}>{filtered.length} / {items.length}</span>
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{selected.length} selected</span>
          <span style={{ color: 'var(--mut)', fontSize: 13 }}>Set cost:</span>
          <input className="bulk-input" type="number" step="0.01" min="0" placeholder="€0.00" value={bulkCost} onChange={e => setBulkCost(e.target.value)} />
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--cs)' }} onClick={applyBulkCost} disabled={bulkSaving || bulkCost === ''}>
            {bulkSaving ? <span className="loading-spin" /> : 'Apply'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <ItemTable
        key={groupView ? 'grouped' : 'individual'}
        columns={columns}
        rows={displayRows}
        selectable={!groupView}
        selected={selected}
        onSelectChange={setSelected}
        onEdit={item => setModal({ item })}
        onDelete={item => setDeleteTarget(item)}
        onPhoto={item => setPhotoItem(item)}
        extraActions={row => (
          row._isGroup ? (
            <button
              className="btn-icon"
              title={expandedGroups.has(row._groupKey) ? 'Collapse' : `Show ${row._groupCount} lots`}
              onClick={() => toggleGroup(row._groupKey)}
            >
              {expandedGroups.has(row._groupKey) ? '▼' : '▶'}
            </button>
          ) : (
            <>
              {!row._isSubRow && <button className="btn-icon" title="Record sale" onClick={() => setSellItem(row)}>💰</button>}
              <MoreMenu>
                <MoreMenuItem onClick={() => setLedgerItem(row)}>📓 Notebook</MoreMenuItem>
              </MoreMenu>
            </>
          )
        )}
        emptyMessage={filtered.length === 0 && items.length > 0 ? 'No skins match your filters.' : 'No CS2 skins added yet.'}
      />

      {modal && (
        <AddItemModal
          vertical="cs2"
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
          title="Delete skin"
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
          vertical="cs2"
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
