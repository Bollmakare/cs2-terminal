'use client'

export function DashboardClient(props: Record<string, unknown>) {
  const portfolioName = props.portfolioName as string
  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-y-auto">
      <div className="panel px-4 py-3 flex-shrink-0">
        <div className="panel-title">CS2 Terminal</div>
        <div className="font-mono text-xs text-muted-3">{portfolioName}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {['Holdings', 'Scanner', 'History', 'Watchlist'].map(function(s) { return (
          <div key={s} className="panel px-4 py-3">
            <div className="kpi-label mb-1.5">{s}</div>
            <div className="font-mono font-bold tabular-nums text-lg">--</div>
          </div>
        )})}
      </div>
    </div>
  )
}
