import { useState, useMemo } from 'react'
import StatCards from '../components/StatCards.jsx'
import ItemTable from '../components/ItemTable.jsx'
import AddItemModal from '../components/AddItemModal.jsx'
import ImageModal from '../components/ImageModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fmt, pct, fmts, sgn, calcPnl, effectiveValue, downloadCsv } from '../lib/utils.js'
import { addItem, updateItem, deleteItem } from '../lib/api.js'
import { openWineSearcher } from '../lib/pricing/wine.js'
import { useToast } from '../components/Toast.jsx'

export default function WineView({ items: initItems, userId, onItemsChange }) {
  const toast = useToast()
  const [items, setItems] = useState(initItems ?? [])
  const [modal, setModal] = useState(null)
  const [photoItem, setPhotoItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useMemo(() => setItems(initItems ?? []), [initItems])

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
      onItemsChange?.(); toast('Bottle updated', 'success')
    } else {
      const created = await addItem(payload)
      setItems(prev => [created, ...prev])
      onItemsChange?.(); toast('Bottle added', 'success')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteItem(deleteTarget.id)
    setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
    onItemsChange?.()
    setDeleteTarget(null); toast('Bottle deleted', 'success')
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
      region: i.metadata?.region ?? '',
      format: i.metadata?.format ?? '',
      cost: i.cost,
      value: i.value ?? '',
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
      render: row => (
        <div className="item-name-cell">
          {row.metadata?.images?.[0]
            ? <img className="thumb" src={row.metadata.images[0]} alt="" onClick={() => setPhotoItem(row)} />
            : <div className="thumb-placeholder" />}
          <span>{row.name}</span>
        </div>
      )
    },
    { key: 'producer', label: 'Producer', render: row => row.metadata?.producer ?? '—' },
    { key: 'vintage', label: 'Vintage', render: row => <span className="mono">{row.metadata?.vintage ?? '—'}</span> },
    { key: 'format', label: 'Format', render: row => row.metadata?.format ?? '—' },
    { key: 'region', label: 'Region', render: row => row.metadata?.region ?? '—' },
    { key: 'qty', label: 'Qty', render: row => <span className="mono">{row.qty}</span> },
    { key: 'cost', label: 'Cost', render: row => <span className="mono">{fmt(row.cost)}</span> },
    { key: 'value', label: 'Value', render: row => <span className="mono">{fmt(effectiveValue(row))}</span> },
    {
      key: 'pnl', label: 'P&L',
      render: row => {
        const { abs, pct: p } = calcPnl(row.cost ?? 0, effectiveValue(row), row.qty)
        return (
          <div className={sgn(abs)}>
            <div className="mono" style={{ fontSize: 13 }}>{pct(p)}</div>
            <div className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{fmts(abs)}</div>
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
          <button className="btn btn-primary btn-sm" style={{ background: 'var(--wine)' }} onClick={() => setModal({ item: null })}>
            + Add Bottle
          </button>
        </div>
      </div>

      <StatCards cards={statCards} />

      <ItemTable
        columns={columns}
        rows={items}
        onEdit={item => setModal({ item })}
        onDelete={item => setDeleteTarget(item)}
        onPhoto={item => setPhotoItem(item)}
        extraActions={row => (
          <button
            className="btn-icon"
            title="Search on Wine-Searcher"
            onClick={() => openWineSearcher(row.name, row.metadata?.vintage, row.metadata?.producer)}
          >
            🔍
          </button>
        )}
        emptyMessage="No wine bottles added yet."
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
    </div>
  )
}
