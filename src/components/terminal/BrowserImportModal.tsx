'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  onClose: () => void
}

const BOOKMARKLET = `javascript:${encodeURIComponent(`(function(){
  var APP='https://bollmakare-cs2-dashboard.vercel.app';
  var items=[];
  // Try Steam inventory page globals
  try{
    var inv=document.querySelectorAll('[class*="item"]');
    // Read item names from the inventory page DOM
    // Steam uses data attributes on item elements
    var els=document.querySelectorAll('.item.app730.context2');
    els.forEach(function(el){
      var name=el.getAttribute('data-market-hash-name')||el.querySelector('.item_name')?.textContent;
      var assetid=el.getAttribute('data-assetid')||el.id?.replace('item','');
      if(name) items.push({name:name.trim(),assetid:assetid});
    });
  }catch(e){}
  // Also try g_rgAssets global (older Steam pages)
  try{
    var assets=window.g_rgAssets&&window.g_rgAssets['730']&&window.g_rgAssets['730']['2'];
    var descs=window.g_rgDescriptions&&window.g_rgDescriptions['730']&&window.g_rgDescriptions['730']['2'];
    if(assets&&descs){
      items=[];
      for(var id in assets){
        var a=assets[id];
        var key=a.classid+'_'+a.instanceid;
        var d=descs[key];
        if(d&&d.marketable&&d.market_hash_name) items.push({name:d.market_hash_name,assetid:a.id||id});
      }
    }
  }catch(e){}
  if(!items.length){
    alert('CS2 Terminal: Could not read inventory. Make sure you are on your Steam inventory page (steamcommunity.com > Inventory > CS2 items visible).');
    return;
  }
  // Copy to clipboard as JSON for paste import
  var payload=JSON.stringify({items:items});
  navigator.clipboard.writeText(payload).then(function(){
    alert('CS2 Terminal: Copied '+items.length+' items to clipboard!\nGo back to CS2 Terminal > Inventory > Import from Browser, then paste.');
  }).catch(function(){
    // Fallback: open textarea with the data
    var w=window.open('','_blank','width=600,height=400');
    w.document.write('<textarea style="width:100%;height:100%;font-size:11px">'+payload+'</textarea><p>Copy all text above and paste in CS2 Terminal</p>');
  });
})()`)}`

export function BrowserImportModal({ onClose }: Props) {
  const [paste, setPaste] = useState('')
  const [step, setStep] = useState<'instructions'|'paste'|'done'>('instructions')
  const [result, setResult] = useState<{imported:number;total:number}|null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const handleImport = async () => {
    if (!paste.trim()) return
    setLoading(true)
    setError('')
    try {
      let body: Record<string, unknown>
      const parsed = JSON.parse(paste)
      // Accept both formats
      if (parsed.items || parsed.assets) {
        body = parsed
      } else if (Array.isArray(parsed)) {
        body = { items: parsed }
      } else {
        throw new Error('Unrecognized format')
      }

      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['holdings'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div className='absolute inset-0 bg-black/70 backdrop-blur-sm' onClick={onClose} />
      <div className='relative panel w-full max-w-lg p-6 z-10 flex flex-col gap-5'>
        <div className='flex items-center justify-between'>
          <span className='font-mono text-[10px] uppercase tracking-widest text-muted-3'>Import from Browser</span>
          <button onClick={onClose} className='font-mono text-muted-3 hover:text-[var(--text)] text-lg leading-none'>&#x2715;</button>
        </div>

        {step === 'instructions' && (
          <>
            <div className='flex flex-col gap-4'>
              <div className='panel p-4 bg-black/20'>
                <div className='font-mono text-[10px] uppercase tracking-widest text-green mb-3'>Option 1 — Bookmarklet (recommended)</div>
                <ol className='font-mono text-xs text-muted-2 flex flex-col gap-2 list-none'>
                  <li><span className='text-muted-4'>1.</span> Drag this button to your bookmarks bar:</li>
                  <li className='pl-4'>
                    <a
                      href={BOOKMARKLET}
                      className='inline-block font-mono text-[10px] px-3 py-1.5 border border-green/40 text-green rounded hover:bg-green/10 transition-colors cursor-grab active:cursor-grabbing'
                      onClick={e => { e.preventDefault(); alert('Drag this to your bookmarks bar, then click it on your Steam inventory page.') }}
                    >
                      📦 CS2 Terminal Import
                    </a>
                  </li>
                  <li><span className='text-muted-4'>2.</span> Open your <span className='text-[var(--text)]'>Steam inventory</span> in a new tab</li>
                  <li><span className='text-muted-4'>3.</span> Click the bookmarklet — it copies your items</li>
                  <li><span className='text-muted-4'>4.</span> Come back here and paste below</li>
                </ol>
              </div>

              <div className='panel p-4 bg-black/20'>
                <div className='font-mono text-[10px] uppercase tracking-widest text-muted-3 mb-3'>Option 2 — Steam Inventory JSON</div>
                <ol className='font-mono text-xs text-muted-2 flex flex-col gap-2 list-none'>
                  <li><span className='text-muted-4'>1.</span> Open this URL in your browser (while logged into Steam):</li>
                  <li className='pl-4 font-mono text-[10px] text-amber break-all select-all'>steamcommunity.com/inventory/YOUR_STEAM_ID/730/2</li>
                  <li><span className='text-muted-4'>2.</span> Select all (Ctrl+A), copy (Ctrl+C)</li>
                  <li><span className='text-muted-4'>3.</span> Paste below</li>
                </ol>
              </div>
            </div>
            <button onClick={() => setStep('paste')} className='btn-primary text-sm py-2'>
              Continue — Paste Data &rarr;
            </button>
          </>
        )}

        {step === 'paste' && (
          <>
            <textarea
              value={paste}
              onChange={e => setPaste(e.target.value)}
              placeholder='Paste your inventory JSON here...'
              className='input-terminal text-xs w-full h-44 resize-none font-mono'
              autoFocus
            />
            {error && <p className='font-mono text-xs text-red'>{error}</p>}
            <div className='flex gap-2'>
              <button onClick={() => setStep('instructions')} className='btn-terminal text-xs flex-1'>&#8592; Back</button>
              <button
                onClick={handleImport}
                disabled={loading || !paste.trim()}
                className='btn-primary text-sm py-2 flex-1'
              >
                {loading ? 'Importing...' : 'Import Items'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div className='flex flex-col items-center gap-4 py-4'>
            <div className='font-mono text-3xl text-green'>&#x2713;</div>
            <div className='text-center'>
              <div className='font-mono text-sm text-[var(--text)]'>{result.imported} items imported</div>
              <div className='font-mono text-xs text-muted-3 mt-1'>out of {result.total} found in your inventory</div>
              {result.imported < result.total && (
                <div className='font-mono text-[10px] text-muted-4 mt-2'>
                  {result.total - result.imported} skipped (duplicates or already in portfolio)
                </div>
              )}
            </div>
            <button onClick={onClose} className='btn-primary text-sm px-6'>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}