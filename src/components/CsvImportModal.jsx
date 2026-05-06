import { useState, useRef } from 'react'
import { useEscapeKey } from '../lib/hooks.js'
import { addItem } from '../lib/api.js'
import { useToast } from './Toast.jsx'
import { downloadCsv } from '../lib/utils.js'

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else { current += ch }
  }
  result.push(current)
  return result
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => Object.fromEntries(headers.map((h, i) => [h, (parseCsvLine(line)[i] ?? '').trim()])))
    .filter(row => Object.values(row).some(v => v !== ''))
}

function rowToPayload(row, vertical, userId) {
  const name = row.name?.trim()
  if (!name) return null
  const base = {
    vertical, user_id: userId, name,
    cost: parseFloat(row.cost) || 0,
    value: parseFloat(row.value) || 0,
    qty: parseInt(row.qty, 10) || 1,
  }
  if (vertical === 'cs2') return { ...base, metadata: {
    wear: row.wear || null,
    float: row.float ? parseFloat(row.float) : null,
    stattrak: ['true', '1', 'yes'].includes(row.stattrak?.toLowerCase()),
    inspect_link: row.inspect_link || null,
    notes: row.notes || null,
  }}
  if (vertical === 'pokemon') return { ...base, metadata: {
    item_type: row.item_type || 'card',
    set_name: row.set_name || '',
    card_number: row.card_number || '',
    rarity: row.rarity || null,
    condition: row.condition || 'NM',
    grade: row.grade || 'Ungraded',
    cert_number: row.cert_number || null,
    language: row.language || 'EN',
    portfolio: row.portfolio || 'Main',
    notes: row.notes || null,
  }}
  if (vertical === 'wine') return { ...base, metadata: {
    producer: row.producer || '',
    vintage: row.vintage ? parseInt(row.vintage) : null,
    region: row.region || '',
    appellation: row.appellation || null,
    format: row.format || '750ml',
    lot_number: row.lot_number || null,
    bin_location: row.bin_location || null,
    drink_from: row.drink_from ? parseInt(row.drink_from) : null,
    drink_to: row.drink_to ? parseInt(row.drink_to) : null,
    storage_notes: row.storage_notes || null,
  }}
  return null
}

const TEMPLATES = {
  cs2: [{ name: 'AK-47 | Redline (Field-Tested)', wear: 'FT', float: '0.2500', stattrak: 'false', cost: '45.00', value: '', qty: '1', notes: '', inspect_link: '' }],
  pokemon: [{ name: 'Charizard', set_name: 'Base Set', card_number: '4/102', rarity: 'Rare Holo', condition: 'NM', grade: 'Ungraded', cert_number: '', language: 'EN', item_type: 'card', portfolio: 'Main', cost: '500.00', value: '', qty: '1', notes: '' }],
  wine: [{ name: 'Château Pétrus', producer: 'Pétrus', vintage: '2018', region: 'Bordeaux', appellation: 'Pomerol', format: '750ml', lot_number: '', bin_location: 'Cave A · Rack 3', drink_from: '2025', drink_to: '2045', cost: '2500.00', value: '', qty: '1', storage_notes: '' }],
}

export default function CsvImportModal({ vertical, userId, onClose, onImported }) {
  const toast = useToast()
  useEscapeKey(onClose)
  const fileRef = useRef(null)
  const [rows, setRows] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCsv(ev.target.result)
      setRows(parsed)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!rows?.length) return
    setImporting(true)
    setProgress(0)
    let succeeded = 0
    let failed = 0
    const created = []
    for (let i = 0; i < rows.length; i++) {
      const payload = rowToPayload(rows[i], vertical, userId)
      if (!payload) { failed++; setProgress(i + 1); continue }
      try {
        const item = await addItem(payload)
        created.push(item)
        succeeded++
      } catch { failed++ }
      setProgress(i + 1)
    }
    setDone({ succeeded, failed })
    setImporting(false)
    if (succeeded > 0) onImported(created)
  }

  const vLabel = vertical === 'cs2' ? 'CS2' : vertical === 'pokemon' ? 'Pokémon' : 'Wine'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title">Import {vLabel} Items</div>
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 20, marginTop: -12 }}>
          Upload a CSV file to bulk-add items to your portfolio.
        </div>

        {done ? (
          <div>
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '20px', textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{done.failed === 0 ? '✅' : '⚠️'}</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 600, color: 'var(--grn)' }}>{done.succeeded} imported</div>
              {done.failed > 0 && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 4 }}>{done.failed} skipped (missing name or error)</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadCsv(TEMPLATES[vertical], `vault-${vertical}-template.csv`)}
              >
                ↓ Download Template
              </button>
              <span style={{ fontSize: 12, color: 'var(--mut)', alignSelf: 'center' }}>
                Fill it in, then upload below
              </span>
            </div>

            <div
              style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '30px', textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
              {rows ? (
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 600, color: 'var(--grn)', marginBottom: 4 }}>{rows.length} rows ready</div>
                  <div style={{ fontSize: 12, color: 'var(--mut)' }}>Click to choose a different file</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>Click to choose a CSV file</div>
                  <div style={{ fontSize: 12, color: 'var(--mut)' }}>or drag and drop</div>
                </div>
              )}
            </div>

            {rows && rows.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', fontWeight: 600, marginBottom: 8 }}>
                  Preview (first 3 rows)
                </div>
                <div style={{ overflowX: 'auto', background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
                  <table style={{ fontSize: 11, fontFamily: 'JetBrains Mono', borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>{Object.keys(rows[0]).map(h => <th key={h} style={{ textAlign: 'left', padding: '2px 8px', color: 'var(--mut)', fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>{Object.values(row).map((v, j) => <td key={j} style={{ padding: '2px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importing && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(progress / rows.length) * 100}%`, background: 'var(--grn)', transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 6 }}>{progress} / {rows.length}</div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose} disabled={importing}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={!rows?.length || importing}
              >
                {importing ? <span className="loading-spin" /> : `Import ${rows?.length ?? 0} items`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
