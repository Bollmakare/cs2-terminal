import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import StatCards from '../components/StatCards.jsx'
import { fmt, fmts, pct, sgn, greetingTime, calcPnl, effectiveValue } from '../lib/utils.js'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: 'var(--gold)' }}>{fmt(payload[0].value)}</div>
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
      return { v, val, cost, count: its.length, pnlPct: cost > 0 ? ((val - cost) / cost) * 100 : 0 }
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

  const chartData = useMemo(() => {
    if (!snapshots?.length) return []
    return snapshots.map(s => ({
      date: new Date(s.recorded_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      value: s.price,
    }))
  }, [snapshots])

  const vert = { cs2: { label: 'CS2 Skins', color: 'var(--cs)', to: '/cs2' }, pokemon: { label: 'Pokémon TCG', color: 'var(--pkm)', to: '/pokemon' }, wine: { label: 'Wine Cellar', color: 'var(--wine)', to: '/wine' } }

  const statCards = [
    { label: 'Net Worth', value: fmt(totals.value) },
    { label: 'Total Invested', value: fmt(totals.cost) },
    { label: 'Total P&L', value: `${pct(totals.pct)} ${fmts(totals.pnl)}`, colorClass: sgn(totals.pnl) },
    { label: 'Items', value: String(totals.count) },
  ]

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
              <div className="vertical-bar-bg">
                <div className="vertical-bar-fill" style={{ width: `${totals.value > 0 ? Math.min((val / totals.value) * 100, 100) : 0}%`, background: info.color }} />
              </div>
            </div>
          )
        })}
      </div>

      {chartData.length > 1 && (
        <div className="chart-wrap" style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 14 }}>Portfolio History</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--mut)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--mut)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={v => fmts(v)} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--gold)' }} />
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
                  <span className="top-performer-val">{fmt(item.value ?? item.cost)}</span>
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
