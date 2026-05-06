import { useState, useRef, useEffect } from 'react'

export function MoreMenuItem({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 4, fontSize: 13,
        color: 'var(--txt)', width: '100%', textAlign: 'left',
        transition: 'background 0.1s', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  )
}

export default function MoreMenu({ children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn-icon"
        title="More actions"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: 14, letterSpacing: '0.05em' }}
      >
        •••
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            background: 'var(--bg2)', border: '1px solid var(--b2)',
            borderRadius: 6, padding: 4, zIndex: 50,
            display: 'flex', flexDirection: 'column', gap: 1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
