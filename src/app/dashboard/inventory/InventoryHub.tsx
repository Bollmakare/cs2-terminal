'use client'
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ManualAddModal } from '@/components/terminal/ManualAddModal'
import { BrowserImportModal } from '@/components/terminal/BrowserImportModal'
import { InventoryClient } from './InventoryClient'

interface Props {
  steamId: string | null
  portfolioId: string | null
}

export function InventoryHub({ steamId, portfolioId }: Props) {
  const [showManual, setShowManual] = useState(false)
  const [showBrowserImport, setShowBrowserImport] = useState(false)
  const [showSteam, setShowSteam] = useState(false)
  const qc = useQueryClient()

  const handleAdded = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['holdings'] })
  }, [qc])

  if (showSteam) {
    return (
      <div className='flex flex-col h-[calc(100vh-88px)]'>
        <div className='flex items-center gap-3 px-4 py-2 flex-shrink-0'>
          <button onClick={() => setShowSteam(false)} className='font-mono text-[10px] text-muted-3 hover:text-[var(--text)]'>
            &#8592; Back
          </button>
          <span className='font-mono text-[10px] text-muted-3 uppercase tracking-widest'>Steam Import</span>
        </div>
        <div className='flex-1 overflow-hidden'>
          <InventoryClient steamId={steamId} portfolioId={portfolioId} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='flex flex-col h-[calc(100vh-88px)] overflow-y-auto'>

        {/* Top bar */}
        <div className='panel px-5 py-3 flex-shrink-0 flex items-center justify-between flex-wrap gap-3'>
          <div>
            <div className='font-mono text-[10px] text-muted-3 uppercase tracking-widest'>Steam Inventory</div>
            <div className='font-mono text-xs text-muted-2'>Import your CS2 skins into the portfolio tracker</div>
          </div>
          <div className='flex gap-2'>
            <button onClick={() => setShowManual(true)} className='btn-terminal text-[10px] py-1.5 px-3'>+ Add Manually</button>
            {steamId && <button onClick={() => setShowSteam(true)} className='btn-terminal text-[10px] py-1.5 px-3'>Steam API</button>}
          </div>
        </div>

        {/* Hero instruction block */}
        <div className='flex-1 flex flex-col items-center justify-center px-6 py-10 gap-8'>

          {/* Title */}
          <div className='text-center'>
            <div className='font-mono text-[10px] uppercase tracking-[0.3em] text-green mb-2'>How to import your inventory</div>
            <div className='font-mono text-2xl font-bold text-[var(--text)]'>3 steps. Takes 30 seconds.</div>
          </div>

          {/* Steps */}
          <div className='flex flex-col md:flex-row items-center justify-center gap-0 w-full max-w-3xl'>

            {/* Step 1 */}
            <div className='flex flex-col items-center gap-3 flex-1 p-5'>
              <div className='w-16 h-16 rounded-full border-2 border-green/60 flex items-center justify-center bg-green/10 flex-shrink-0'>
                <span className='font-mono text-2xl font-black text-green'>1</span>
              </div>
              <div className='font-mono text-xs font-bold text-[var(--text)] text-center'>Open Steam Inventory</div>
              <div className='font-mono text-[10px] text-muted-3 text-center leading-relaxed'>
                Go to your Steam profile<br/>click <span className='text-[var(--text)]'>Inventory</span> → switch to <span className='text-[var(--text)]'>CS2</span>
              </div>
              <code className='font-mono text-[9px] text-amber bg-black/30 px-2 py-1 rounded break-all text-center'>
                steamcommunity.com/id/YOU/inventory
              </code>
            </div>

            {/* Arrow */}
            <div className='font-mono text-3xl text-muted-4 px-2 rotate-90 md:rotate-0 flex-shrink-0'>&#10230;</div>

            {/* Step 2 */}
            <div className='flex flex-col items-center gap-3 flex-1 p-5'>
              <div className='w-16 h-16 rounded-full border-2 border-green/60 flex items-center justify-center bg-green/10 flex-shrink-0'>
                <span className='font-mono text-2xl font-black text-green'>2</span>
              </div>
              <div className='font-mono text-xs font-bold text-[var(--text)] text-center'>Copy Inventory URL</div>
              <div className='font-mono text-[10px] text-muted-3 text-center leading-relaxed'>
                In the address bar, change the URL to the JSON endpoint and copy the page
              </div>
              <code className='font-mono text-[9px] text-amber bg-black/30 px-2 py-1 rounded break-all text-center'>
                steamcommunity.com/inventory/<span className='text-green'>STEAMID</span>/730/2
              </code>
            </div>

            {/* Arrow */}
            <div className='font-mono text-3xl text-muted-4 px-2 rotate-90 md:rotate-0 flex-shrink-0'>&#10230;</div>

            {/* Step 3 */}
            <div className='flex flex-col items-center gap-3 flex-1 p-5'>
              <div className='w-16 h-16 rounded-full border-2 border-green/60 flex items-center justify-center bg-green/10 flex-shrink-0'>
                <span className='font-mono text-2xl font-black text-green'>3</span>
              </div>
              <div className='font-mono text-xs font-bold text-[var(--text)] text-center'>Paste Here</div>
              <div className='font-mono text-[10px] text-muted-3 text-center leading-relaxed'>
                Select all (Ctrl+A), copy (Ctrl+C),<br/>then click the button below and paste
              </div>
              <div className='font-mono text-[9px] text-muted-4 text-center'>Items added with current market prices</div>
            </div>

          </div>

          {/* Big CTA */}
          <button
            onClick={() => setShowBrowserImport(true)}
            className='btn-primary text-base py-4 px-12 font-bold tracking-wide flex items-center gap-3'
          >
            <span className='text-xl'>&#x1F4E6;</span>
            Import My Inventory
          </button>

          {/* Divider */}
          <div className='flex items-center gap-4 w-full max-w-sm'>
            <div className='flex-1 h-px bg-terminal-border' />
            <span className='font-mono text-[9px] text-muted-4 uppercase tracking-widest'>or</span>
            <div className='flex-1 h-px bg-terminal-border' />
          </div>

          {/* Secondary options */}
          <div className='flex flex-col sm:flex-row gap-3 w-full max-w-sm'>
            <button
              onClick={() => setShowManual(true)}
              className='btn-terminal text-xs py-2.5 flex-1 flex items-center justify-center gap-2'
            >
              <span>&#x270F;</span> Add item manually
            </button>
            {steamId && (
              <button
                onClick={() => setShowSteam(true)}
                className='btn-terminal text-xs py-2.5 flex-1 flex items-center justify-center gap-2 opacity-50'
              >
                <span>&#x2B07;</span> Steam API (needs key)
              </button>
            )}
          </div>

          {/* CS2 Trader note */}
          <div className='panel px-4 py-3 max-w-md w-full flex items-start gap-3'>
            <span className='text-lg flex-shrink-0'>&#x1F9E9;</span>
            <div>
              <div className='font-mono text-[10px] font-bold text-[var(--text)] mb-0.5'>Using CS2 Trader / CSGO Trader extension?</div>
              <div className='font-mono text-[10px] text-muted-3 leading-relaxed'>
                Click <span className='text-[var(--text)]'>Import My Inventory</span> above &#x2192; use the bookmarklet option. Drag the button to your bookmarks bar, click it on your Steam inventory page &#x2014; done.
              </div>
            </div>
          </div>

        </div>
      </div>

      {showManual && portfolioId && (
        <ManualAddModal portfolioId={portfolioId} onAdded={handleAdded} onClose={() => setShowManual(false)} />
      )}
      {showBrowserImport && (
        <BrowserImportModal onClose={() => setShowBrowserImport(false)} />
      )}
    </>
  )
}