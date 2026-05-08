const CS2_FALLBACK_LABELS = {
  'fallback-skinport': 'Live · skinport',
  'fallback-steam': 'Live · steam market',
  'fallback-csgotrader': 'Live · csgotrader',
}

export default function StatusBar({ cs2Status, pkmnStatus, onRefreshCS2, onRefreshPkm, onMenuClick }) {
  const isFallback = cs2Status.startsWith('fallback')
  const dotColor = cs2Status === 'ok' || isFallback ? 'green' : cs2Status === 'loading' ? 'yellow' : cs2Status === 'limit' ? 'red' : 'grey'

  return (
    <div className="status-bar">
      <button className="hamburger" onClick={onMenuClick} aria-label="Menu">☰</button>
      <span className={`status-dot ${dotColor}`} />
      <span className="status-label">
        CS2{' '}
        {cs2Status === 'ok' ? 'Live'
          : isFallback ? (CS2_FALLBACK_LABELS[cs2Status] ?? 'Live · fallback')
          : cs2Status === 'loading' ? 'Fetching…'
          : cs2Status === 'limit' ? 'Limit reached'
          : cs2Status === 'error' ? 'Unavailable'
          : '—'}
      </span>

      <span className="status-sep">|</span>

      <span className={`status-dot ${pkmnStatus === 'ok' ? 'green' : pkmnStatus === 'loading' ? 'yellow' : 'grey'}`} />
      <span className="status-label">
        Pokémon {pkmnStatus === 'ok' ? 'Live' : pkmnStatus === 'loading' ? 'Fetching…' : 'TCGio'}
      </span>

      <div className="status-bar-right">
        <button className="btn-refresh" onClick={onRefreshCS2} disabled={cs2Status === 'loading'}>
          {cs2Status === 'loading'
            ? <span className="loading-spin" style={{ width: 10, height: 10 }} />
            : '↺'}
          CS2
        </button>
        <button className="btn-refresh" onClick={onRefreshPkm} disabled={pkmnStatus === 'loading'}>
          {pkmnStatus === 'loading'
            ? <span className="loading-spin" style={{ width: 10, height: 10 }} />
            : '↺'}
          PKM
        </button>
      </div>
    </div>
  )
}
