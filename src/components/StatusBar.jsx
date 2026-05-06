import { useState } from 'react'
import { getUsage } from '../lib/pricing/cs2.js'

export default function StatusBar({ cs2Status, pkmnStatus, onRefreshCS2, onRefreshPkm }) {
  const usage = getUsage()
  const dayWarn = usage.day > usage.dayLimit * 0.8
  const monthWarn = usage.month > usage.monthLimit * 0.8

  return (
    <div className="status-bar">
      <span className={`status-dot ${cs2Status === 'ok' ? 'green' : cs2Status === 'loading' ? 'yellow' : 'red'}`} />
      <span className="status-label">
        CS2 {cs2Status === 'ok' ? 'Live' : cs2Status === 'loading' ? 'Fetching…' : cs2Status === 'limit' ? 'Limit reached' : 'Offline'}
      </span>

      <span className="status-sep">|</span>

      <span className={`status-dot ${pkmnStatus === 'ok' ? 'green' : pkmnStatus === 'loading' ? 'yellow' : 'grey'}`} />
      <span className="status-label">
        Pokémon {pkmnStatus === 'ok' ? 'Live' : pkmnStatus === 'loading' ? 'Fetching…' : 'TCGio'}
      </span>

      <span className="status-sep">|</span>
      <span className="status-label" style={{ color: 'var(--wine)' }}>Wine — Manual</span>

      <div className="status-bar-right">
        <span className={`usage-pill ${dayWarn ? 'warn' : ''}`}>
          PE {usage.day}/{usage.dayLimit}d
        </span>
        <span className={`usage-pill ${monthWarn ? 'warn' : ''}`}>
          PE {usage.month}/{usage.monthLimit}m
        </span>

        <button className="btn-refresh" onClick={onRefreshCS2} disabled={cs2Status === 'loading'}>
          {cs2Status === 'loading' ? <span className="loading-spin" style={{ width: 10, height: 10 }} /> : '↺'}
          CS2
        </button>
        <button className="btn-refresh" onClick={onRefreshPkm} disabled={pkmnStatus === 'loading'}>
          {pkmnStatus === 'loading' ? <span className="loading-spin" style={{ width: 10, height: 10 }} /> : '↺'}
          PKM
        </button>
      </div>
    </div>
  )
}
