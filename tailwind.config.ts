import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        mono:    ['var(--font-mono)', ...fontFamily.mono],
        sans:    ['var(--font-sans)', ...fontFamily.sans],
        display: ['var(--font-display)', ...fontFamily.serif],
      },
      colors: {
        // Terminal palette
        terminal: {
          bg:      '#0a0a0a',
          surface: '#111111',
          border:  '#1e1e1e',
          muted:   '#2a2a2a',
        },
        // Signal accents
        green:  { DEFAULT: '#00ff88', dim: '#00cc6a', soft: '#00ff8818', glow: '#00ff8840' },
        red:    { DEFAULT: '#ff3355', dim: '#cc2244', soft: '#ff335518', glow: '#ff335540' },
        amber:  { DEFAULT: '#f59e0b', dim: '#d97706', soft: '#f59e0b18', glow: '#f59e0b40' },
        blue:   { DEFAULT: '#3b82f6', dim: '#2563eb', soft: '#3b82f618', glow: '#3b82f640' },
        // Category colors
        knife:   '#f97316',
        rifle:   '#60a5fa',
        sniper:  '#a78bfa',
        pistol:  '#34d399',
        gloves:  '#f472b6',
        case:    '#fbbf24',
        sticker: '#94a3b8',
      },
      borderColor: {
        DEFAULT: '#1e1e1e',
      },
      animation: {
        'blink':         'blink 1s step-end infinite',
        'scan-line':     'scan-line 4s linear infinite',
        'fade-in':       'fade-in 0.2s ease',
        'slide-up':      'slide-up 0.25s cubic-bezier(0.16,1,0.3,1)',
        'pulse-green':   'pulse-green 2s ease-in-out infinite',
        'ticker':        'ticker 30s linear infinite',
        'modal-pop':     'modal-pop 0.2s cubic-bezier(0.34,1.2,0.64,1)',
        'number-up':     'number-up 0.4s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        blink:         { '50%': { opacity: '0' } },
        'scan-line':   { '0%': { top: '0%' }, '100%': { top: '100%' } },
        'fade-in':     { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up':    { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pulse-green': { '0%,100%': { boxShadow: '0 0 0 0 #00ff8840' }, '50%': { boxShadow: '0 0 0 4px #00ff8800' } },
        ticker:        { '0%': { transform: 'translateX(0%)' }, '100%': { transform: 'translateX(-50%)' } },
        'modal-pop':   { from: { opacity: '0', transform: 'scale(0.95) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
        'number-up':   { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      backgroundImage: {
        'grid-terminal': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        'scanlines':     'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
      },
      backgroundSize: {
        'grid-sm': '24px 24px',
      },
    },
  },
  plugins: [animate],
}
export default config
