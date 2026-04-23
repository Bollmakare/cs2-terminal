'use client'

export function PortfolioClient(props: Record<string, unknown>) {
  const portfolioName = props.portfolioName as string
  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      <div className="panel px-4 py-3 flex-shrink-0">
        <div className="panel-title">Portfolio</div>
        <div className="font-mono text-xs text-muted-3">{portfolioName}</div>
      </div>
      <div className="panel p-8 text-center">
        <p className="font-mono text-sm text-muted-2">Portfolio management coming soon</p>
      </div>
    </div>
  )
}
