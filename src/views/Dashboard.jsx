import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import StatCards from '../components/StatCards.jsx'
import { fmt, fmts, pct, sgn, greetingTime, calcPnl, effectiveValue } from '../lib/utils.js'

const THIS_YEAR = new Date().getFullYear()
const PERIODS = [{ key: '1w', label: '1W', days: 7 }, { key: '1m', label: '1M', days: 30 }, { key: '3m', label: '3M', days: 90 }, { key: '1y', label: '1Y', days: 365 }, { key: 'all', label: 'All', days: Infinity }]

function CustomTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: v >= 0 ? 'var(--gold)' : 'var(--red)' }}>
        {mode === 'pct' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : fmt(v)}
      </div>
    </div>
  )
}

export default function Dashboard({ items, snapshots, user }) {
  const navigate = useNavigate()

  const totals = useMemo(() => {
    if (!items?.length) return { value: 0, cost: 0, count: 0, pnl: 0, pct: 0 }
    const value = items.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)
    const cost = items.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0)
    const pnlAbs = value - cost
    const pnlPct = cost > 0 ? (pnlAbs / cost) * 100 : 0
    return { value, cost, pnl: pnlAbs, pct: pnlPct, count: items.length }
  }, [items])

  const byVertical = useMemo(() => {
    const verts = ['cs2', 'pokemon', 'wine']
    return verts.map(v => {
      const its = items?.filter(i => i.vertical === v) ?? []
      const val = its.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)
      const cost = its.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0)
      const unpriced = its.filter(i => !i.last_price_fetched_at).length
      return { v, val, cost, count: its.length, pnlPct: cost > 0 ? ((val - cost) / cost) * 100 : 0, unpriced }
    })
  }, [items])

  const topPerformers = useMemo(() => {
    if (!items?.length) return []
    return items
      .map(i => {
        const { pct: p } = calcPnl(i.cost ?? 0, effectiveValue(i), i.qty)
        return { ...i, pnlPct: p }
      })
      .filter(i => i.cost > 0)
      .sort((a, b) => b.pnlPct - a.pnlPct)
      .slice(0, 5)
  }, [items])

  const concentration = useMemo(() => {
    if (!items?.length || totals.value === 0) return []
    return items
      .map(i => ({ ...i, holding: effectiveValue(i) * i.qty }))
      .sort((a, b) => b.holding - a.holding)
      .slice(0, 10)
      .map(i => ({ ...i, pctOfTotal: (i.holding / totals.value) * 100 }))
  }, [items, totals.value])

  const [chartMode, setChartMode] = useState('eur')
  const [chartPeriod, setChartPeriod] = useState('all')

  const chartData = useMemo(() => {
    if (!snapshots?.length) return []
    const days = PERIODS.find(p => p.key === chartPeriod)?.days ?? Infinity
    const cutoff = Date.now() - days * 86400000
    const filtered = chartPeriod === 'all' ? snapshots : snapshots.filter(s => new Date(s.recorded_at).getTime() >= cutoff)
    if (!filtered.length) return []
    const base = filtered[0].price
    return filtered.map(s => ({
      date: new Date(s.recorded_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      value: s.price,
      pct: base > 0 ? ((s.price - base) / base) * 100 : 0,
    }))
  }, [snapshots, chartPeriod])

  const chartChange = useMemo(() => {
    if (chartData.length < 2) return null
    const first = chartData[0].value
    const last = chartData[chartData.length - 1].value
    const abs = last - first
    const rel = first > 0 ? (abs / first) * 100 : 0
    return { abs, rel }
  }, [chartData])

  const vert = { cs2: { label: 'CS2 Skins', color: 'var(--cs)', to: '/cs2' }, pokemon: { label: 'Pokémon TCG', color: 'var(--pkm)', to: '/pokemon' }, wine: { label: 'Wine Cellar', color: 'var(--wine)', to: '/wine' } }

  const statCards = [
    { label: 'Net Worth', value: fmt(totals.value) },
    { label: 'Total Invested', value: fmt(totals.cost) },
    { label: 'Return', value: pct(totals.pct), colorClass: sgn(totals.pnl) },
    { label: 'P&L', value: fmts(totals.pnl), colorClass: sgn(totals.pnl) },
  ]

  const drinkingWindow = useMemo(() => {
    const wines = items?.filter(i => i.vertical === 'wine') ?? []
    const ready = wines.filter(i => {
      const f = i.metadata?.drink_from, t = i.metadata?.drink_to
      return f && t && THIS_YEAR >= f && THIS_YEAR <= t
    })
    const soon = wines.filter(i => {
      const f = i.metadata?.drink_from, t = i.metadata?.drink_to
      if (t && THIS_YEAR > t) return false
      return f && f > THIS_YEAR && f <= THIS_YEAR + 2
    })
    const pastPeak = wines.filter(i => {
      const t = i.metadata?.drink_to
      return t && THIS_YEAR > t
    })
    return { ready, soon, pastPeak }
  }, [items])

  const hasAlerts = drinkingWindow.ready.length > 0 || drinkingWindow.soon.length > 0 || drinkingWindow.pastPeak.length > 0

  const greeting = greetingTime()
  const firstName = user?.email?.split('@')[0] ?? 'Collector'

  return (
    <div>
      <div className="greeting">
        {greeting}, <span>{firstName}</span>.
      </div>

      <StatCards cards={statCards} />

      <div className="vertical-cards">
        {byVertical.map(({ v, val, cost, count, pnlPct }) => {
          const info = vert[v]
          return (
            <div key={v} className="vertical-card" style={{ borderColor: `${info.color}22` }} onClick={() => navigate(info.to)}>
              <div className="vertical-card-header">
                <span className="vertical-card-name" style={{ color: info.color }}>{info.label}</span>
                <span className="vertical-card-count">{count} items</span>
              </div>
              <div className="vertical-card-value" style={{ color: info.color }}>{fmt(val)}</div>
              <div className="vertical-card-meta">
                <span className={sgn(pnlPct)}>{pct(pnlPct)}</span>
                <span style={{ color: 'var(--mut)' }}> · {fmt(cost)} invested</span>
              </div>
              {unpriced > 0 && (
                <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 4 }}>
                  ⚠ {unpriced} item{unpriced !== 1 ? 's' : ''} need pricing
                </div>
              )}
              <div className="vertical-bar-bg">
                <div className="vertical-bar-fill" style={{ width: `${totals.value > 0 ? Math.min((val / totals.value) * 100, 100) : 0}%`, background: info.color }} />
              </div>
            </div>
          )
        })}
      </div>

      {hasAlerts && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>🍷 Cellar Alerts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drinkingWindow.ready.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6, padding: '9px 14px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--grn)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  {item.metadata?.vintage && <span className="mono" style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 8 }}>{item.metadata.vintage}</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--grn)' }}>Ready now · {item.metadata?.drink_from}–{item.metadata?.drink_to}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--mut)' }}>×{item.qty}</span>
              </div>
            ))}
            {drinkingWindow.soon.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: '9px 14px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  {item.metadata?.vintage && <span className="mono" style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 8 }}>{item.metadata.vintage}</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--gold)' }}>Ready from {item.metadata?.drink_from}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--mut)' }}>×{item.qty}</span>
              </div>
            ))}
            {drinkingWindow.pastPeak.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 14px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mut)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, color: 'var(--mut)' }}>{item.name}</span>
                  {item.metadata?.vintage && <span className="mono" style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 8 }}>{item.metadata.vintage}</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--mut)' }}>Past peak · best before {item.metadata?.drink_to}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--mut)' }}>×{item.qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="chart-wrap" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div className="section-title" style={{ flex: 1 }}>Portfolio History</div>
            {chartChange && (
              <span className={`pnl-chip ${chartChange.abs >= 0 ? 'pos' : 'neg'}`}>
                {chartChange.abs >= 0 ? '+' : ''}{fmts(chartChange.abs)} ({chartChange.abs >= 0 ? '+' : ''}{chartChange.rel.toFixed(2)}%)
              </span>
            )}
            <div style={{ display: 'flex', gap: 3 }}>
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setChartPeriod(p.key)} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                  background: chartPeriod === p.key ? 'var(--gold)' : 'var(--bg3)',
                  color: chartPeriod === p.key ? '#0b0d12' : 'var(--mut)',
                  border: '1px solid var(--border)', fontFamily: 'JetBrains Mono',
                }}>{p.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[{ key: 'eur', label: '€' }, { key: 'pct', label: '%' }].map(m => (
                <button key={m.key} onClick={() => setChartMode(m.key)} style={{
                  fontSize: 10, padding: '2px 9px', borderRadius: 3, cursor: 'pointer',
                  background: chartMode === m.key ? 'var(--gold)' : 'var(--bg3)',
                  color: chartMode === m.key ? '#0b0d12' : 'var(--mut)',
                  border: '1px solid var(--border)', fontFamily: 'JetBrains Mono',
                }}>{m.label}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--mut)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--mut)', fontFamily: 'JetBrains Mono' }}
                axisLine={false} tickLine={false} width={56}
                tickFormatter={v => chartMode === 'eur' ? fmts(v) : `${v.toFixed(1)}%`}
              />
              <Tooltip content={<CustomTooltip mode={chartMode} />} />
              {chartMode === 'pct' && <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />}
              <Line
                type="monotone"
                dataKey={chartMode === 'eur' ? 'value' : 'pct'}
                stroke="var(--gold)" strokeWidth={2} dot={false}
                activeDot={{ r: 4, fill: 'var(--gold)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="dashboard-cols">
        <div>
          <div className="section-title">Top Performers</div>
          {topPerformers.length === 0 ? (
            <div className="top-performers"><div style={{ padding: '20px 14px', color: 'var(--mut)', fontSize: 13 }}>No data yet.</div></div>
          ) : (
            <div className="top-performers">
              {topPerformers.map((item, i) => (
                <div key={item.id} className="top-performer-row">
                  <span className="top-performer-rank">#{i + 1}</span>
                  <span className="top-performer-name">{item.name}</span>
                  <span className="top-performer-val">{fmt(effectiveValue(item))}</span>
                  <span className={`top-performer-pct ${sgn(item.pnlPct)}`}>{pct(item.pnlPct)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-title">Concentration Risk</div>
          {concentration.length === 0 ? (
            <div className="conc-risk"><div style={{ padding: '20px 14px', color: 'var(--mut)', fontSize: 13 }}>No data yet.</div></div>
          ) : (
            <div className="conc-risk">
              {concentration.map(item => (
                <div key={item.id} className="conc-risk-row">
                  <span className="conc-risk-name">{item.name}</span>
                  <div className="conc-risk-bar-wrap">
                    <div
                      className="conc-risk-bar"
                      style={{
                        width: `${item.pctOfTotal}%`,
                        background: item.vertical === 'cs2' ? 'var(--cs)' : item.vertical === 'pokemon' ? 'var(--pkm)' : 'var(--wine)',
                      }}
                    />
                  </div>
                  <span className="conc-risk-pct">{item.pctOfTotal.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
