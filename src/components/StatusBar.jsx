export default function StatusBar({ cs2Status, pkmnStatus, onRefreshCS2, onRefreshPkm, onMenuClick }) {
  return (
    <div className="status-bar">
      <button className="hamburger" onClick={onMenuClick} aria-label="Menu">☰</button>
      <span className={`status-dot ${cs2Status === 'ok' ? 'green' : cs2Status === 'loading' ? 'yellow' : cs2Status === 'limit' ? 'red' : 'grey'}`} />
      <span className="status-label">
        CS2{' '}
        {cs2Status === 'ok' ? 'Live'
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

      <span className="status-sep">|</span>
      <span className="status-label" style={{ color: 'var(--wine)' }}>Wine — Manual</span>

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
