import { useState, useEffect } from 'react'

const WEAR_OPTIONS = ['FN', 'MW', 'FT', 'WW', 'BS']
const CONDITION_OPTIONS = ['NM', 'LP', 'MP', 'HP', 'D']
const GRADE_OPTIONS = ['Ungraded', 'PSA 10', 'PSA 9', 'BGS 9.5', 'CGC 10', 'Other']
const LANG_OPTIONS = ['EN', 'JPN', 'DE', 'FR', 'KR']
const ITEM_TYPE_OPTIONS = ['card', 'booster_box', 'etb', 'pack', 'tin', 'sealed_other']
const ITEM_TYPE_LABELS = { card: 'Single Card', booster_box: 'Booster Box', etb: 'ETB', pack: 'Pack', tin: 'Tin', sealed_other: 'Other Sealed' }
const PORTFOLIO_OPTIONS = ['brun single', 'green single', 'Single svart', 'Main']
const FORMAT_OPTIONS = ['750ml', '375ml', '1.5L Magnum', '3L', '6L']

function Field({ label, children, full }) {
  return (
    <div className={`form-group ${full ? 'full' : ''}`}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

function mkMeta(vertical, f) {
  if (vertical === 'cs2') {
    return {
      wear: f.wear,
      float: f.float ? parseFloat(f.float) : null,
      stattrak: f.stattrak === 'true',
      notes: f.notes,
    }
  }
  if (vertical === 'pokemon') {
    return {
      item_type: f.item_type,
      set_name: f.set_name,
      card_number: f.card_number,
      condition: f.condition,
      grade: f.grade,
      language: f.language,
      portfolio: f.portfolio,
    }
  }
  if (vertical === 'wine') {
    return {
      producer: f.producer,
      vintage: f.vintage,
      region: f.region,
      format: f.format,
      storage_notes: f.storage_notes,
    }
  }
  return {}
}

function defaultFields(vertical, item) {
  const m = item?.metadata ?? {}
  if (vertical === 'cs2') return {
    name: item?.name ?? '',
    wear: m.wear ?? 'FN',
    float: m.float != null ? String(m.float) : '',
    stattrak: m.stattrak ? 'true' : 'false',
    cost: item?.cost != null ? String(item.cost) : '',
    value: item?.value != null ? String(item.value) : '',
    qty: item?.qty != null ? String(item.qty) : '1',
    notes: m.notes ?? '',
  }
  if (vertical === 'pokemon') return {
    name: item?.name ?? '',
    item_type: m.item_type ?? 'card',
    set_name: m.set_name ?? '',
    card_number: m.card_number ?? '',
    condition: m.condition ?? 'NM',
    grade: m.grade ?? 'Ungraded',
    language: m.language ?? 'EN',
    portfolio: m.portfolio ?? 'Main',
    cost: item?.cost != null ? String(item.cost) : '',
    value: item?.value != null ? String(item.value) : '',
    qty: item?.qty != null ? String(item.qty) : '1',
  }
  if (vertical === 'wine') return {
    name: item?.name ?? '',
    producer: m.producer ?? '',
    vintage: m.vintage ?? '',
    region: m.region ?? '',
    format: m.format ?? '750ml',
    cost: item?.cost != null ? String(item.cost) : '',
    value: item?.value != null ? String(item.value) : '',
    qty: item?.qty != null ? String(item.qty) : '1',
    storage_notes: m.storage_notes ?? '',
  }
  return {}
}

export default function AddItemModal({ vertical, item, userId, onSave, onClose }) {
  const isEdit = !!item
  const [f, setF] = useState(() => defaultFields(vertical, item))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(key, val) {
    setF(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload = {
        vertical,
        name: f.name.trim(),
        cost: parseFloat(f.cost) || 0,
        value: f.value !== '' ? parseFloat(f.value) : null,
        qty: parseInt(f.qty) || 1,
        metadata: mkMeta(vertical, f),
        user_id: userId,
      }
      await onSave(payload)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const vColor = vertical === 'cs2' ? 'var(--cs)' : vertical === 'pokemon' ? 'var(--pkm)' : 'var(--wine)'
  const vLabel = vertical === 'cs2' ? 'CS2 Skin' : vertical === 'pokemon' ? 'Pokémon Card' : 'Wine'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color: vColor }}>
          {isEdit ? 'Edit' : 'Add'} {vLabel}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {vertical === 'cs2' && <>
              <Field label="Skin Name" full>
                <input className="form-input" required value={f.name} onChange={e => set('name', e.target.value)} placeholder="AK-47 | Redline (Field-Tested)" />
              </Field>
              <Field label="Wear">
                <select className="form-select" value={f.wear} onChange={e => set('wear', e.target.value)}>
                  {WEAR_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
              <Field label="Float">
                <input className="form-input mono" type="number" step="0.0001" min="0" max="1" value={f.float} onChange={e => set('float', e.target.value)} placeholder="0.1234" />
              </Field>
              <Field label="StatTrak">
                <select className="form-select" value={f.stattrak} onChange={e => set('stattrak', e.target.value)}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </Field>
              <Field label="Purchase Price (€)">
                <input className="form-input mono" type="number" step="0.01" min="0" required value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Current Value (€)">
                <input className="form-input mono" type="number" step="0.01" min="0" value={f.value} onChange={e => set('value', e.target.value)} placeholder="Auto-fetched" />
              </Field>
              <Field label="Qty">
                <input className="form-input mono" type="number" min="1" value={f.qty} onChange={e => set('qty', e.target.value)} />
              </Field>
              <Field label="Notes" full>
                <textarea className="form-textarea" value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional notes" />
              </Field>
            </>}

            {vertical === 'pokemon' && <>
              <Field label="Card Name" full>
                <input className="form-input" required value={f.name} onChange={e => set('name', e.target.value)} placeholder="Charizard" />
              </Field>
              <Field label="Type">
                <select className="form-select" value={f.item_type} onChange={e => set('item_type', e.target.value)}>
                  {ITEM_TYPE_OPTIONS.map(t => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label="Language">
                <select className="form-select" value={f.language} onChange={e => set('language', e.target.value)}>
                  {LANG_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Set Name">
                <input className="form-input" value={f.set_name} onChange={e => set('set_name', e.target.value)} placeholder="Base Set" />
              </Field>
              <Field label="Card Number">
                <input className="form-input mono" value={f.card_number} onChange={e => set('card_number', e.target.value)} placeholder="4/102" />
              </Field>
              <Field label="Condition">
                <select className="form-select" value={f.condition} onChange={e => set('condition', e.target.value)}>
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Grade">
                <select className="form-select" value={f.grade} onChange={e => set('grade', e.target.value)}>
                  {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Portfolio">
                <select className="form-select" value={f.portfolio} onChange={e => set('portfolio', e.target.value)}>
                  {PORTFOLIO_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Purchase Price (€)">
                <input className="form-input mono" type="number" step="0.01" min="0" required value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Current Value (€)">
                <input className="form-input mono" type="number" step="0.01" min="0" value={f.value} onChange={e => set('value', e.target.value)} placeholder="Auto-fetched" />
              </Field>
              <Field label="Qty">
                <input className="form-input mono" type="number" min="1" value={f.qty} onChange={e => set('qty', e.target.value)} />
              </Field>
            </>}

            {vertical === 'wine' && <>
              <Field label="Wine Name" full>
                <input className="form-input" required value={f.name} onChange={e => set('name', e.target.value)} placeholder="Château Pétrus" />
              </Field>
              <Field label="Producer">
                <input className="form-input" value={f.producer} onChange={e => set('producer', e.target.value)} placeholder="Pomerol" />
              </Field>
              <Field label="Vintage">
                <input className="form-input mono" type="number" min="1800" max="2099" value={f.vintage} onChange={e => set('vintage', e.target.value)} placeholder="2015" />
              </Field>
              <Field label="Region">
                <input className="form-input" value={f.region} onChange={e => set('region', e.target.value)} placeholder="Bordeaux" />
              </Field>
              <Field label="Format">
                <select className="form-select" value={f.format} onChange={e => set('format', e.target.value)}>
                  {FORMAT_OPTIONS.map(f2 => <option key={f2} value={f2}>{f2}</option>)}
                </select>
              </Field>
              <Field label="Purchase Price (€)">
                <input className="form-input mono" type="number" step="0.01" min="0" required value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Current Value (€)">
                <input className="form-input mono" type="number" step="0.01" min="0" value={f.value} onChange={e => set('value', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Qty">
                <input className="form-input mono" type="number" min="1" value={f.qty} onChange={e => set('qty', e.target.value)} />
              </Field>
              <Field label="Storage Notes" full>
                <textarea className="form-textarea" value={f.storage_notes} onChange={e => set('storage_notes', e.target.value)} rows={2} placeholder="Temperature, humidity, location…" />
              </Field>
            </>}
          </div>

          {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: vColor }}>
              {saving ? <span className="loading-spin" /> : isEdit ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
