import { fmt, pct, sgn } from '../lib/utils.js'

export default function StatCards({ cards }) {
  return (
    <div className="stat-grid">
      {cards.map((c, i) => (
        <div key={i} className="stat-card">
          <div className="stat-card-label">{c.label}</div>
          <div className={`stat-card-value ${c.colorClass ?? ''}`}>
            {c.value}
          </div>
          {c.sub != null && (
            <div className="stat-card-sub">{c.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}
