'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

interface NewsItem {
  id: string
  title: string
  summary: string | null
  url: string | null
  published_at: string
  tags: string[]
  source: string
}

const TAG_COLORS: Record<string, string> = {
  case:       'var(--amber)',
  patch:      'var(--cat-rifle)',
  major:      'var(--cat-sniper)',
  operation:  'var(--green)',
  collection: 'var(--cat-gloves)',
  items:      'var(--cat-knife)',
  general:    'var(--text-3)',
}

//  Compact ticker tape (for topbar) 
export function NewsTicker() {
  const { data: news = [] } = useQuery<NewsItem[]>({
    queryKey: ['news-ticker'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=12')
      const { news } = await res.json()
      return news ?? []
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  // Static fallback items while loading
  const items = news.length > 0 ? news : [
    { id: '1', title: 'CS2 Terminal  Live market data across 27 markets', tags: ['general'], url: null, published_at: '' },
    { id: '2', title: 'Skinstrack price refresh active  arbitrage scanner running', tags: ['general'], url: null, published_at: '' },
    { id: '3', title: 'Set price alerts on any item in the Watchlist tab', tags: ['general'], url: null, published_at: '' },
  ] as NewsItem[]

  // Double for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className="flex-1 overflow-hidden relative">
      <div
        className="flex gap-8 whitespace-nowrap"
        style={{
          animation: `ticker ${doubled.length * 4}s linear infinite`,
          willChange: 'transform',
        }}
      >
        {doubled.map((item, i) => (
          <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2 flex-shrink-0">
            {item.tags?.[0] && (
              <span className="font-mono text-[8px] font-bold uppercase px-1 py-0.5 rounded"
                style={{ color: TAG_COLORS[item.tags[0]] ?? 'var(--text-3)', background: `${TAG_COLORS[item.tags[0]] ?? 'transparent'}18`, border: `1px solid ${TAG_COLORS[item.tags[0]] ?? 'var(--border)'}33` }}>
                {item.tags[0]}
              </span>
            )}
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener"
                className="font-mono text-[10px] text-muted-2 hover:text-[var(--text)] transition-colors">
                {item.title}
              </a>
            ) : (
              <span className="font-mono text-[10px] text-muted-3">{item.title}</span>
            )}
            <span className="text-muted-4 text-[10px]">.</span>
          </span>
        ))}
      </div>
    </div>
  )
}

//  Full news panel (for dashboard) 
export function NewsPanel() {
  const { data: news = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ['news-panel'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=20')
      const { news } = await res.json()
      return news ?? []
    },
    staleTime: 5 * 60_000,
  })

  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const allTags = [...new Set(news.flatMap((n: any) => n.tags as string[]))].filter(Boolean) as string[]
  const filtered = selectedTag ? news.filter(n => n.tags.includes(selectedTag)) : news

  function timeAgo(dateStr: string): string {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (days > 30)  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    if (days > 0)   return `${days}d ago`
    if (hours > 0)  return `${hours}h ago`
    if (mins > 0)   return `${mins}m ago`
    return 'just now'
  }

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        <span className="panel-title">CS2 News & Events</span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green signal-dot-live" />
          <span className="font-mono text-[9px] text-muted-3">AUTO-REFRESH</span>
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 px-3 py-2 border-b border-terminal-border overflow-x-auto flex-shrink-0">
          <button onClick={() => setSelectedTag(null)}
            className={`font-mono text-[9px] px-2 py-0.5 rounded border transition-all whitespace-nowrap
              ${!selectedTag ? 'bg-green-soft text-green border-green/30' : 'border-terminal-border text-muted-3 hover:text-muted-2'}`}>
            ALL
          </button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              className={`font-mono text-[9px] px-2 py-0.5 rounded border transition-all whitespace-nowrap capitalize
                ${selectedTag === tag ? 'bg-green-soft text-green border-green/30' : 'border-terminal-border text-muted-3 hover:text-muted-2'}`}
              style={selectedTag === tag ? { color: TAG_COLORS[tag], background: `${TAG_COLORS[tag]}15`, borderColor: `${TAG_COLORS[tag]}33` } : {}}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* News list */}
      <div className="flex-1 overflow-y-auto divide-y divide-terminal-border">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 skeleton rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <p className="font-mono text-xs text-muted-3">No news available</p>
          </div>
        ) : (
          filtered.map(item => (
            <div key={item.id} className="px-3 py-2.5 hover:bg-terminal-surface-2 transition-colors">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener"
                      className="font-mono text-[11px] text-[var(--text)] hover:text-green transition-colors line-clamp-2 block">
                      {item.title}
                    </a>
                  ) : (
                    <p className="font-mono text-[11px] text-[var(--text)] line-clamp-2">{item.title}</p>
                  )}
                  {item.summary && (
                    <p className="font-mono text-[9px] text-muted-3 mt-0.5 line-clamp-1">{item.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {item.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="font-mono text-[8px] px-1.5 py-0.5 rounded capitalize"
                        style={{ color: TAG_COLORS[tag] ?? 'var(--text-3)', background: `${TAG_COLORS[tag] ?? 'transparent'}15` }}>
                        {tag}
                      </span>
                    ))}
                    <span className="font-mono text-[9px] text-muted-4">{timeAgo(item.published_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
