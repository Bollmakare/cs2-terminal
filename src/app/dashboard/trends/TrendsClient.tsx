'use client'

export function TrendsClient(_props: Record<string, unknown>) {
  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      <div className="panel px-4 py-3 flex-shrink-0">
        <div className="panel-title">Market Trends</div>
      </div>
      <div className="panel p-8 text-center">
        <p className="font-mono text-sm text-muted-2">Trends coming soon</p>
      </div>
    </div>
  )
}
