import { useState, useMemo } from 'react'
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
      render: row => (
        <div className="item-name-cell">
          {row.metadata?.images?.[0]
            ? <img className="thumb" src={row.metadata.images[0]} alt="" onClick={() => setPhotoItem(row)} />
            : <div className="thumb-placeholder" />}
          <div>
            <div>{row.name}</div>
            {row.metadata?.bin_location && (
              <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>📍 {row.metadata.bin_location}</div>
            )}
          </div>
        </div>
      )
    },
    { key: 'producer', label: 'Producer', render: row => row.metadata?.producer ?? '—' },
    {
      key: 'vintage', label: 'Vintage',
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
    { key: 'format', label: 'Format', render: row => row.metadata?.format ?? '—' },
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
    {
      key: 'held', label: 'Held',
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

      <ItemTable
        columns={columns}
        rows={items}
        onEdit={item => setModal({ item })}
        onDelete={item => setDeleteTarget(item)}
        onPhoto={item => setPhotoItem(item)}
        extraActions={row => (
          <>
            <button className="btn-icon" title="Price history" onClick={() => setPriceItem(row)}>📈</button>
            <button className="btn-icon" title="Open a bottle" onClick={() => setConsumeItem(row)}>🍷</button>
            <button className="btn-icon" title="Notebook" onClick={() => setLedgerItem(row)}>📓</button>
            <button className="btn-icon" title="Search on Wine-Searcher" onClick={() => openWineSearcher(row.name, row.metadata?.vintage, row.metadata?.producer)}>🔍</button>
          </>
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
