import { useEffect } from 'react'

export function useEscapeKey(handler) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') handler() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [handler])
}
