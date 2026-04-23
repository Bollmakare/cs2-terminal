'use client'

export function RiskAnalyticsClient({ portfolioId, portfolioName, defaultFeePct }: {
  portfolioId: string
  portfolioName: string
  defaultFeePct: number
}) {
  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      <div className="panel px-4 py-3 flex-shrink-0">
        <div className="panel-title">Risk Analytics</div>
        <div className="font-mono text-xs text-muted-3">{portfolioName} &middot; Fee: {defaultFeePct}%</div>
      </div>
      <div className="panel p-8 text-center">
        <p className="font-mono text-sm text-muted-2">Risk analytics coming soon</p>
        <p className="font-mono text-xs text-muted-3 mt-1">Portfolio: {portfolioId.substring(0,8)}...</p>
      </div>
    </div>
  )
}
