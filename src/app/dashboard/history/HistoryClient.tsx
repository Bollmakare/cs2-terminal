'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fmt$, fmtPct, fmtDate, CAT_COLOR } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

type TxFilter = 'all' | 'buy' | 'sell'
type TxSort   = 'date_desc' | 'date_asc' | 'pnl_desc' | 'pnl_asc' | 'amount_desc'

function useTxns(portfolioId: string) {
  return useQuery({
    queryKey: ['transactions', portfolioId],
    queryFn: async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('transacted_at', { ascending: false })
      return data ?? []
    },
  })
}

export function HistoryClient({ portfolioId }: { portfolioId: string }) {
  const { data: txns = [], isLoading } = useTxns(portfolioId)
  const [filter, setFilter] = useState<TxFilter>('all')
  const [sort, setSort]     = useState<TxSort>('date_desc')
  const [search, setSearch] = useState('')
  const [chartView, setChartView] = useState<'pnl' | 'volume'>('pnl')

  // Stats
  const sells        = txns.filter((t: any) => t.type === 'sell')
  const realizedPnl  = sells.reduce((s: number, t: any) => s + (t.realized_pnl ?? 0), 0)
  const totalVolume  = txns.reduce((s: number, t: any) => s + (t.price_per_unit * t.quantity), 0)
  const winCount     = sells.filter((t: any) => (t.realized_pnl ?? 0) > 0).length
  const winRate      = sells.length > 0 ? (winCount / sells.length) * 100 : 0
  const bestTrade    = sells.reduce((best: any, t: any) => (!best || (t.realized_pnl ?? 0) > (best.realized_pnl ?? 0)) ? t : best, null)
  const worstTrade   = sells.reduce((worst: any, t: any) => (!worst || (t.realized_pnl ?? 0) < (worst.realized_pnl ?? 0)) ? t : worst, null)

  // Monthly P&L for chart
  const monthlyPnl = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of sells) {
      const month = (t as any).transacted_at?.slice(0, 7) ?? ''
      map[month] = (map[month] ?? 0) + ((t as any).realized_pnl ?? 0)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, pnl]) => ({
      month: month.slice(5) + '/' + month.slice(2, 4),
      pnl: Math.round(pnl * 100) / 100,
    }))
  }, [sells])

  // Filtered + sorted
  const visible = useMemo(() => {
    let rows = filter === 'all' ? txns : txns.filter((t: any) => t.type === filter)
    if (search) rows = rows.filter((t: any) => t.item_name?.toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a: any, b: any) => {
      if (sort === 'date_asc')    return a.transacted_at.localeCompare(b.transacted_at)
      if (sort === 'pnl_desc')    return (b.realized_pnl ?? 0) - (a.realized_pnl ?? 0)
      if (sort === 'pnl_asc')     return (a.realized_pnl ?? 0) - (b.realized_pnl ?? 0)
      if (sort === 'amount_desc') return (b.price_per_unit * b.quantity) - (a.price_per_unit * a.quantity)
      return b.transacted_at.localeCompare(a.transacted_at)
    })
  }, [txns, filter, sort, search])

  function exportCSV() {
    const cols = ['Date','Type','Item','Cond','Qty','Price/unit','Gross','Fee%','Fee amt','Net','Cost basis','Realized P&L','ST/LT','Note']
    const rows = [cols]
    const sorted = [...(txns as any[])].sort((a, b) =>
      new Date(a.transacted_at).getTime() - new Date(b.transacted_at).getTime()
    )
    for (const t of sorted) {
      const stlt = t.type === 'sell'
        ? (t.days_held > 365 ? 'Long-term' : 'Short-term') : ''
      rows.push([
        t.transacted_at, t.type, t.item_name, t.item_condition ?? '',
        t.quantity, t.price_per_unit,
        t.gross_proceeds ?? '', t.fee_pct ?? '', t.fee_amount ?? '',
        t.net_proceeds ?? '', t.cost_basis ?? '', t.realized_pnl ?? '',
        stlt, t.note ?? ''
      ].map(String))
    }
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const csv = rows.map(r => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `cs2-ledger-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  function exportTaxSummary() {
    const yearMap: Record<string, { realized: number; trades: number }> = {}
    for (const t of txns as any[]) {
      if (t.type !== 'sell') continue
      const yr = (t.transacted_at ?? '').slice(0, 4)
      if (!yr) continue
      if (!yearMap[yr]) yearMap[yr] = { realized: 0, trades: 0 }
      yearMap[yr].realized += t.realized_pnl ?? 0
      yearMap[yr].trades   += 1
    }
    const cols = ['Tax Year', 'Total Realized P&L ($)', '# Sell Trades', 'Disclaimer']
    const rows = [cols, ...Object.entries(yearMap).sort().map(([yr, d]) => [
      yr, d.realized.toFixed(2), String(d.trades),
      'For reference only. Consult a tax professional. CS2 items may be taxable in your jurisdiction.'
    ])]
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const csv = rows.map(r => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `cs2-tax-summary-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.[0]) return null
    return (
      <div className="bg-terminal-surface-2 border border-terminal-border-2 rounded p-2 shadow-lg">
  2     <div className="font-mono text-[10px] text-muted-3 mb-1">{label}</div>
        <div className="font-mono text-sm font-bold" style={{ color: payload[0].value >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {fmt$(payload[0].value, { sign: true })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3 flex-shrink-0">
        {[
          { label: 'Realized P&L',  val: fmt$(realizedPnl, { sign: true }), col: realizedPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Total volume',  val: fmt$(totalVolume),                  col: undefined },
          { label: 'Win rate',      val: `${winRate.toFixed(0)}%`,           col: winRate >= 50 ? 'var(--green)' : 'var(--red)' },
          { label: 'Trades',        val: String(txns.length),                col: undefined },
          { label: 'Sells',         val: String(sells.length),               col: undefined },
        ].map(k => (
          <div key={k.label} className="panel px-4 py-3">
            <div className="kpi-label mb-1.5">{k.label}</div>
            <div className="font-mono font-bold tabular-nums text-lg" style={{ color: k.col ?? 'var(--text)' }}>
              {isLoading ? <span className="skeleton inline-block w-16 h-5" /> : k.val}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-1 overflow-hidden">
        {/* Ledger */}
        <div className="panel flex flex-col flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="panel-header gap-3 flex-shrink-0 flex-wrap">
            <div className="flex">
              {(['all', 'buy', 'sell'] as TxFilter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider border-b-2 transition-all capitalize
                    ${filter === f ? 'border-green text-green' : 'border-transparent text-muted-3 hover:text-muted-2'}`}>
                  {f}
                </button>
              ))}
            </div>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..." className="input-terminal text-xs py-1 w-36" />
            <select value={sort} onChange={e => setSort(e.target.value as TxSort)}
              className="input-terminal text-xs py-1 w-36">
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="pnl_desc">P&L </option>
              <option value="pnl_asc">P&L </option>
              <option value="amount_desc">Amount </option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-3">{visible.length} records</span>
              <button onClick={exportCSV} className="btn-terminal text-[10px] py-1"> Ledger CSV</button>
              <button onClick={exportTaxSummary} className="btn-terminal text-[10px] py-1"> Tax Summary</button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-12 skeleton rounded" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <span className="text-3xl text-muted-4">"</span>
                <p className="font-mono text-sm text-muted-2">No transactions yet</p>
                <p className="font-mono text-xs text-muted-3">Sell holdings to build your ledger</p>
              </div>
            ) : (
              <table className="term-table w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-28">Date</th>
              2     <th className="w-12">Type</th>
                    <th>Item</th>
                    <th className="term-num w-10">Qty</th>
                    <th className="term-num w-24">Price</th>
                    <th className="term-num w-24">Net</th>
                    <th className="term-num w-24">Cost basis</th>
                    <th className="term-num w-24">P&L</th>
                    <th className="term-num w-16">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t: any) => {
                    const isSell = t.type === 'sell'
                    const pnl    = t.realized_pnl ?? 0
                    return (
                      <tr key={t.id}>
                       2<td className="font-mono text-[10px] text-muted-3">{t.transacted_at}</td>
                        <td>
                          <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase
                            ${isSell ? 'bg-red-soft text-red' : 'bg-green-soft text-green'}`}>
                            {t.type}
                          </span>
                        </td>
                        <td>
                          <div className="font-mono text-[11px] text-[var(--text)] truncate max-w-[280px]">{t.item_name}</div>
                          {t.note && <div className="font-mono text-[9px] text-muted-4 truncate">{t.note}</div>}
                        </td>
                        <td className="term-num font-mono text-xs text-muted-2">{t.quantity}</td>
                        <td className="term-num font-mono text-xs">{fmt$(t.price_per_unit)}</td>
                        <td className="term-num font-mono text-xs">
                          {isSell ? fmt$(t.net_proceeds) : `${fmt$(t.price_per_unit * t.quantity)}`}
                        </td>
                      2 <td className="term-num font-mono text-xs text-muted-2">
                          {t.cost_basis != null ? fmt$(t.cost_basis) : ''}
                        </td>
                        <td className="term-num font-mono text-xs font-bold">
                          {isSell && t.realized_pnl != null ? (
                            <span style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {fmt$(pnl, { sign: true })}
                            </span>
                          ) : <span className="text-muted-4"></span>}
                        </td>
                        <td className="term-num font-mono text-[10px] text-muted-3">
                          {t.fee_pct != null ? `${t.fee_pct}%` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right sidebar: chart + best/worst */}
        <div className="w-72 flex flex-col gap-3 flex-shrink-0 overflow-y-auto">
          {/* Monthly P&L chart */}
 2      <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Monthly P&L</span>
            </div>
            <div className="p-3 h-44">
              {monthlyPnl.length < 2 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="font-mono text-xs text-muted-3 text-center">Need sell transactions<br/>to build chart</p>
      2            </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPnl} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-3)' }} tickLine={false} axisLine={false}
                      tickFormatter={v => `$${Math.abs(v)>= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                    <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                      {monthlyPnl.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? 'var(--green)' : 'var(--red)'} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Best / worst trades */}
          <div className="panel">
            <div className="panel-header"><span className="panel-title">Notable trades</span></div>
            <div className="p-3 space-y-3">
              {bestTrade && (
                <div>
                  <div className="font-mono text-[9px] text-green uppercase tracking-widest mb-1">Best trade</div>
                  <div className="font-mono text-[11px] text-[var(--text)] truncate">{bestTrade.item_name}</div>
                  <div className="font-mono text-sm font-bold text-green">+{fmt$(bestTrade.realized_pnl)}</div>
                  <div className="font-mono text-[9px] text-muted-d-3">{bestTrade.transacted_at}</div>
                </div>
              )}
              {worstTrade && worstTrade.id !== bestTrade?.id && (
                <div className="pt-2 border-t border-terminal-border">
                  <div className="font-mono text-[9px] text-red uppercase tracking-widest mb-1">Worst trade</div>
                  <div className="font-mono text-[11px] text-[var(--text)] truncate">{worstTrade.item_name}</div>
                  <div className="font-mono text-sm font-bold text-red">{fmt$(worstTrade.realized_pnl, { sign: true })}</div>
                  <div className="font-mono text-[9px] text-muted-3">{worstTrade.transacted_at}</div>
                </div>
              )}
              {!bestTrade && <p className="font-mono text-xs text-muted-3">No sell trades yet</p>}
            </div>
          </div>

          <p className="font-mono text-[9px] text-muted-4 text-center">
            P&L shown after platform fees . for tax record keeping only
          </p>
        </div>
      </div>
    </div>
  )
}
