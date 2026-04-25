'use client'
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ManualAddModal } from '@/components/terminal/ManualAddModal'
import { InventoryClient } from './InventoryClient'

interface Props {
  steamId: string | null
  portfolioId: string | null
}

export function InventoryHub({ steamId, portfolioId }: Props) {
  const [showModal, setShowModal] = useState(false)
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
          <div className='flex gap-2'>
            {steamId && (
              <button
                onClick={() => setShowSteam(true)}
                className='btn-terminal text-[10px] py-1.5 px-3'
              >
                &#x2B07; Import from Steam
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              className='btn-primary text-xs py-1.5 px-4'
            >
              + Add Manually
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className='flex-1 flex items-center justify-center p-8'>
          <div className='panel p-10 max-w-md w-full flex flex-col items-center gap-6 text-center'>
            <div className='font-mono text-4xl text-muted-4'>&#x25A1;</div>
            <div>
              <div className='font-mono text-sm text-[var(--text)] mb-2'>Add items to your portfolio</div>
              <div className='font-mono text-xs text-muted-3'>
                Search any CS2 skin by name and add it with your purchase price.
                {steamId && ' Or import directly from your Steam inventory.'}
              </div>
            </div>
            <div className='flex flex-col gap-3 w-full'>
              <button
                onClick={() => setShowModal(true)}
                className='btn-primary text-sm py-3 w-full'
              >
                + Add Manually
              </button>
              {steamId && (
                <button
                  onClick={() => setShowSteam(true)}
                  className='btn-terminal text-sm py-3 w-full'
                >
                  &#x2B07; Import from Steam Inventory
                </button>
              )}
            </div>
            <p className='font-mono text-[10px] text-muted-4'>
              {portfolioId ? '' : 'No portfolio found. Create one in Holdings first.'}
            </p>
          </div>
        </div>
      </div>

      {showModal && portfolioId && (
        <ManualAddModal
          portfolioId={portfolioId}
          onAdded={handleAdded}
          onClose={() => setShowModal(false)}
        />
      )}
      {showModal && !portfolioId && (
        <div className='fixed inset-0 z-50 flex items-center justify-center' onClick={() => setShowModal(false)}>
          <div className='absolute inset-0 bg-black/60' />
          <div className='relative panel p-8 max-w-sm text-center'>
            <p className='font-mono text-sm text-muted-2 mb-3'>No portfolio found</p>
            <p className='font-mono text-xs text-muted-3'>Go to Holdings tab to create your portfolio first.</p>
          </div>
        </div>
      )}
    </>
  )
}