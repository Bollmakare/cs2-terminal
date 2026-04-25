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
          <button onClick={() => setShowSteam(false)} className='font-mono text-[10px] text-muted-3 hover:text-[var(--text)] transition-colors'>
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
      <div className='flex flex-col h-[calc(100vh-88px)] overflow-hidden'>
        {/* Header */}
        <div className='panel px-4 py-3 flex-shrink-0 flex items-center justify-between flex-wrap gap-3'>
          <div>
            <div className='font-mono text-[10px] text-muted-3 uppercase tracking-widest'>Inventory</div>
            <div className='font-mono text-xs text-muted-2'>Add CS2 skins to your portfolio</div>
          </div>
          <div className='flex gap-2 flex-wrap'>
            <button onClick={() => setShowBrowserImport(true)} className='btn-terminal text-[10px] py-1.5 px-3'>
              &#x1F4E6; Import from Browser
            </button>
            {steamId && (
              <button onClick={() => setShowSteam(true)} className='btn-terminal text-[10px] py-1.5 px-3'>
                &#x2B07; Steam Import
              </button>
            )}
            <button onClick={() => setShowManual(true)} className='btn-primary text-xs py-1.5 px-4'>
              + Add Manually
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className='flex-1 flex items-center justify-center p-8'>
          <div className='panel p-10 max-w-lg w-full flex flex-col items-center gap-6 text-center'>
            <div className='font-mono text-4xl text-muted-4'>&#x25A1;</div>
            <div>
              <div className='font-mono text-sm text-[var(--text)] mb-2'>Add skins to your portfolio</div>
              <div className='font-mono text-xs text-muted-3 leading-relaxed'>
                Three ways to add your CS2 items:
              </div>
            </div>

            <div className='flex flex-col gap-3 w-full'>
              {/* Browser import — primary for most users */}
              <button onClick={() => setShowBrowserImport(true)} className='btn-terminal text-sm py-3 w-full flex items-center justify-center gap-2'>
                <span>&#x1F4E6;</span>
                <span>Import from Browser / CS2 Trader</span>
              </button>
              <div className='font-mono text-[10px] text-muted-4 -mt-2'>
                Works with CS2 Trader extension, or any Steam inventory page
              </div>

              <button onClick={() => setShowManual(true)} className='btn-primary text-sm py-3 w-full'>
                + Add Manually
              </button>
              <div className='font-mono text-[10px] text-muted-4 -mt-2'>
                Search any CS2 item by name and add with your buy price
              </div>

              {steamId && (
                <>
                  <button onClick={() => setShowSteam(true)} className='btn-terminal text-sm py-3 w-full opacity-60'>
                    &#x2B07; Steam API Import (requires Steam API key)
                  </button>
                  <div className='font-mono text-[10px] text-muted-4 -mt-2'>
                    Needs STEAM_API_KEY in Vercel settings
                  </div>
                </>
              )}
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