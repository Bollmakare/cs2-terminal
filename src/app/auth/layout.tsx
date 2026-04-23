import type { ReactNode } from 'react'
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-terminal-bg flex items-center justify-center p-6 relative">
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  )
}
