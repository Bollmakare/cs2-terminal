'use client'

import { useState, useEffect, useCallback } from 'react'

interface Holding {
  id: string
  item_name: string
  item_condition: string | null
  item_category: string | null
  is_stattrak: boolean
  quantity: number
  cost_basis: number
  current_price: number
  acquired_at: string
}

interface Props {
  portfolioId: string
  portfolioName: string
}

const fmt$ = (n: number) => '$' + n.toFixed(2)
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%'

export function PortfolioClient({ portfolioId, portfolioName }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/holdings?portfolio_id=${portfolioId}`)
      let data: any
      try { data = await res.json() } catch { data = {} }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setHoldings(data.holdings ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  useEffect(() => { load() }, [load])

  async function refreshPrices() {
    setRefreshing(true); setError('')
    try {
      const res = await fetch('/api/prices/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_id: portfolioId }),
      })
      let data: any
      try { data = await res.json() } catch { data = {} }
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRefreshing(false)
    }
  }

  async function deleteHolding(id: string) {
    if (!confirm('Delete this holding?')) return
    await fetch(`/api/holdings?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const totalCost  = holdings.reduce((s, h) => s + h.cost_basis * h.quantity, 0)
  const totalValue = holdings.reduce((s, h) => s + h.current_price * h.quantity, 0)
  const totalPnl   = totalValue - totalCost
  const totalPct   = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="font-mono text-sm text-muted-2 uppercase tracking-widest">{portfolioName}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="btn-terminal text-[10px] py-1 px-2">↑ Import</button>
          <button onClick={() => setShowAdd(true)} className="btn-terminal text-[10px] py-1 px-2">+ Add</button>
          <button onClick={refreshPrices} disabled={refreshing} className="btn-terminal text-[10px] py-1 px-2">
            {refreshing ? '…' : '↻ Prices'}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 px-4 py-2 border-b border-border flex-shrink-0 font-mono text-xs">
        <span><span className="text-muted-3">Value </span><span>{fmt$(totalValue)}</span></span>
        <span><span className="text-muted-3">Cost </span><span className="text-muted-2">{fmt$(totalCost)}</span></span>
        <span>
          <span className="text-muted-3">P&L </span>
          <span style={{ color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmt$(totalPnl)} ({fmtPct(totalPct)})
          </span>
        </span>
        <span><span className="text-muted-3">Items </span><span className="text-muted-2">{holdings.length}</span></span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="font-mono text-xs text-muted-3 p-4">Loading…</p>
        ) : holdings.length === 0 ? (
          <p className="font-mono text-xs text-muted-3 p-4">
            No holdings yet. Click <strong>↑ Import</strong> to import from Steam or <strong>+ Add</strong> to add manually.
          </p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-terminal-surface border-b border-border">
              <tr className="font-mono text-[10px] text-muted-3 uppercase tracking-widest">
                <th className="px-4 py-2 font-normal">Item</th>
                <th className="term-num py-2 font-normal">Qty</th>
                <th className="term-num py-2 font-normal">Cost</th>
                <th className="term-num py-2 font-normal">Price</th>
                <th className="term-num py-2 font-normal">Value</th>
                <th className="term-num py-2 font-normal">P&L</th>
                <th className="term-num py-2 font-normal">%</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {holdings.map(h => {
                const cost  = h.cost_basis * h.quantity
                const value = h.current_price * h.quantity
                const pnl   = value - cost
                const pct   = cost > 0 ? (pnl / cost) * 100 : 0
                const color = pnl >= 0 ? 'var(--green)' : 'var(--red)'
                const isEditing = editId === h.id

                return (
                  <tr key={h.id} className="hover:bg-terminal-surface-2 transition-colors">
                    {/* Name */}
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs">{h.item_name}</div>
                      {h.item_condition && (
                        <div className="font-mono text-[9px] text-muted-3">{h.item_condition}</div>
                      )}
                    </td>

                    {isEditing ? (
                      <EditRow holding={h} onSave={() => { setEditId(null); load() }} onCancel={() => setEditId(null)} />
                    ) : (
                      <>
                        <td className="term-num font-mono text-xs text-muted-2">{h.quantity}</td>
                        <td className="term-num font-mono text-xs text-muted-2">{fmt$(h.cost_basis)}</td>
                        <td className="term-num font-mono text-xs">{fmt$(h.current_price)}</td>
                        <td className="term-num font-mono text-xs font-bold">{fmt$(value)}</td>
                        <td className="term-num font-mono text-xs" style={{ color }}>{fmt$(pnl)}</td>
                        <td className="term-num font-mono text-xs" style={{ color }}>{fmtPct(pct)}</td>
                      </>
                    )}

                    {/* Actions */}
                    <td className="pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditId(isEditing ? null : h.id)}
                          className="btn-terminal py-0.5 px-1.5 text-[9px]"
                        >{isEditing ? '✕' : '✎'}</button>
                        <button
                          onClick={() => deleteHolding(h.id)}
                          className="btn-terminal py-0.5 px-1.5 text-[9px] hover:border-red/30 hover:text-red"
                        >✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showImport && (
        <ImportModal
          portfolioId={portfolioId}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load() }}
        />
      )}
      {showAdd && (
        <AddModal
          portfolioId={portfolioId}
          onClose={() => setShowAdd(false)}
          onDone={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

// ── Edit row ──────────────────────────────────────────────────────────────────
function EditRow({ holding, onSave, onCancel }: {
  holding: Holding
  onSave: () => void
  onCancel: () => void
}) {
  const [qty,  setQty]  = useState(String(holding.quantity))
  const [cost, setCost] = useState(holding.cost_basis.toFixed(2))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/holdings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: holding.id, quantity: parseInt(qty) || 1, cost_basis: parseFloat(cost) || 0 }),
    })
    setSaving(false)
    onSave()
  }

  return (
    <>
      <td className="term-num">
        <input type="number" value={qty} min={1} onChange={e => setQty(e.target.value)}
          className="input-terminal w-14 text-center text-xs py-0.5" />
      </td>
      <td className="term-num">
        <input type="number" value={cost} step="0.01" min={0} onChange={e => setCost(e.target.value)}
          className="input-terminal w-20 text-xs py-0.5" />
      </td>
      <td colSpan={4} />
      <td className="pr-3">
        <div className="flex gap-1 justify-end">
          <button onClick={save} disabled={saving} className="btn-terminal py-0.5 px-1.5 text-[9px]">
            {saving ? '…' : '✓'}
          </button>
          <button onClick={onCancel} className="btn-terminal py-0.5 px-1.5 text-[9px]">✕</button>
        </div>
      </td>
    </>
  )
}

// ── Import modal ──────────────────────────────────────────────────────────────
function ImportModal({ portfolioId, onClose, onDone }: {
  portfolioId: string
  onClose: () => void
  onDone: () => void
}) {
  const [mode, setMode] = useState<'steamid' | 'json'>('steamid')
  const [steamId, setSteamId] = useState('')
  const [json, setJson] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ imported: number; skins: number } | null>(null)

  async function doImport() {
    setImporting(true); setError('')
    try {
      const body: any = { portfolio_id: portfolioId }
      if (mode === 'steamid') {
        if (!steamId.trim()) { setError('Enter your SteamID64'); setImporting(false); return }
        body.steam_id = steamId.trim()
      } else {
        if (!json.trim()) { setError('Paste your inventory JSON first'); setImporting(false); return }
        let parsed: any
        try { parsed = JSON.parse(json.trim()) } catch {
          setError('Invalid JSON — copy the complete page (Ctrl+A then Ctrl+C)')
          setImporting(false); return
        }
        body.inventory_json = parsed
      }
      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      let data: any
      try { data = await res.json() } catch { data = {} }
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`)
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-2">Import Steam Inventory</span>
          <button onClick={onClose} className="text-muted-3 hover:text-muted-1 text-lg leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-2">
          <button
            onClick={() => { setMode('steamid'); setError('') }}
            className={`font-mono text-[10px] px-2 py-1 rounded ${mode === 'steamid' ? 'bg-green/20 text-green' : 'text-muted-3 hover:text-muted-1'}`}
          >SteamID (easiest)</button>
          <button
            onClick={() => { setMode('json'); setError('') }}
            className={`font-mono text-[10px] px-2 py-1 rounded ${mode === 'json' ? 'bg-green/20 text-green' : 'text-muted-3 hover:text-muted-1'}`}
          >Paste JSON</button>
        </div>

        {mode === 'steamid' ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-muted-2">
              Enter your SteamID64 — we will fetch your CS2 inventory automatically.
              Make sure your Steam inventory is set to Public.
            </p>
            <input
              type="text"
              value={steamId}
              onChange={e => setSteamId(e.target.value)}
              placeholder="e.g. 76561198012345678"
              className="input-terminal w-full text-xs"
            />
            <p className="font-mono text-[10px] text-muted-3">
              Find your SteamID64 at{' '}
              <a href="https://steamid.io" target="_blank" rel="noopener" className="text-green hover:underline">steamid.io</a>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="p-3 rounded border border-blue/20 bg-blue-soft font-mono text-[10px] text-blue-300 space-y-1">
              <p className="font-bold">How to get your inventory JSON:</p>
              <p>1. Open this URL (replace YOUR_STEAMID64):</p>
              <p className="text-green break-all select-all">https://steamcommunity.com/inventory/YOUR_STEAMID64/730/2?l=english&count=5000</p>
              <p>2. Press Ctrl+A, Ctrl+C to copy all, then paste below</p>
            </div>
            <textarea
              value={json}
              onChange={e => setJson(e.target.value)}
              placeholder={'{"assets":[...],"descriptions":[...]}'}
              rows={5}
              className="input-terminal w-full resize-y font-mono text-[10px]"
            />
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>
        )}
        {result && (
          <div className="px-3 py-2 rounded border border-green/20 bg-green-soft font-mono text-xs text-green space-y-0.5">
            <div>checkmark {result.imported} items imported ({result.skins} skins)</div>
            <div className="text-muted-2">Click Prices to fetch current market prices.</div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          {result ? (
            <button onClick={onDone} className="btn-primary">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-terminal">Cancel</button>
              <button onClick={doImport} disabled={importing} className="btn-primary">
                {importing ? 'Importing...' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add holding modal ─────────────────────────────────────────────────────────
function AddModal({ portfolioId, onClose, onDone }: {
  portfolioId: string
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName]       = useState('')
  const [condition, setCond]  = useState('')
  const [qty,  setQty]        = useState('1')
  const [cost, setCost]       = useState('0')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function save() {
    if (!name.trim()) { setError('Item name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          item_name: name.trim(),
          item_condition: condition || null,
          quantity: parseInt(qty) || 1,
          cost_basis: parseFloat(cost) || 0,
        }),
      })
      let data: any
      try { data = await res.json() } catch { data = {} }
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)
      onDone()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-2">Add Holding</span>
          <button onClick={onClose} className="text-muted-3 hover:text-muted-1 text-lg leading-none">×</button>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. AK-47 | Redline (Field-Tested)"
            className="input-terminal w-full text-xs"
          />
          <select value={condition} onChange={e => setCond(e.target.value)} className="input-terminal w-full text-xs">
            <option value="">Condition (optional)</option>
            <option>Factory New</option>
            <option>Minimal Wear</option>
            <option>Field-Tested</option>
            <option>Well-Worn</option>
            <option>Battle-Scarred</option>
          </select>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="font-mono text-[10px] text-muted-3 block mb-0.5">Quantity</label>
              <input type="number" value={qty} min={1} onChange={e => setQty(e.target.value)}
                className="input-terminal w-full text-xs" />
            </div>
            <div className="flex-1">
              <label className="font-mono text-[10px] text-muted-3 block mb-0.5">Cost per unit ($)</label>
              <input type="number" value={cost} step="0.01" min={0} onChange={e => setCost(e.target.value)}
                className="input-terminal w-full text-xs" />
            </div>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-terminal">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">
            {saving ? 'Saving…' : 'Add →'}
          </button>
        </div>
      </div>
    </div>
  )
}
