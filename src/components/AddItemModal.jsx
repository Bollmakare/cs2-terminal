import { useState } from 'react'

const WEAR_OPTIONS = ['FN', 'MW', 'FT', 'WW', 'BS']
const WEAR_LABELS = { FN: 'Factory New (0.00–0.07)', MW: 'Minimal Wear (0.07–0.15)', FT: 'Field-Tested (0.15–0.38)', WW: 'Well-Worn (0.38–0.45)', BS: 'Battle-Scarred (0.45–1.00)' }
const CONDITION_OPTIONS = ['NM', 'LP', 'MP', 'HP', 'D']
const CONDITION_LABELS = { NM: 'NM — Near Mint', LP: 'LP — Lightly Played', MP: 'MP — Moderately Played', HP: 'HP — Heavily Played', D: 'D — Damaged' }
const GRADE_OPTIONS = ['Ungraded', 'PSA 10', 'PSA 9', 'PSA 8', 'BGS 10', 'BGS 9.5', 'BGS 9', 'CGC 10', 'CGC 9.5', 'CGC 9', 'Other']
const RARITY_OPTIONS = ['', 'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Holo EX', 'Rare Holo GX', 'Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR', 'Rare Ultra', 'Secret Rare', 'Hyper Rare', 'Shiny Rare', 'Special Illustration Rare', 'Illustration Rare', 'Promo']
const LANG_OPTIONS = ['EN', 'JPN', 'DE', 'FR', 'KR', 'IT', 'ES', 'PT']
const ITEM_TYPE_OPTIONS = ['card', 'booster_box', 'etb', 'pack', 'tin', 'sealed_other']
const ITEM_TYPE_LABELS = { card: 'Single Card', booster_box: 'Booster Box', etb: 'ETB', pack: 'Pack', tin: 'Tin', sealed_other: 'Other Sealed' }
const PORTFOLIO_OPTIONS = ['brun single', 'green single', 'Single svart', 'Main']
const FORMAT_OPTIONS = ['750ml', '375ml (Half)', '1.5L Magnum', '3L Double Magnum', '6L Imperial', '9L Salmanazar', '12L Balthazar']

function Field({ label, hint, children, full }) {
  return (
    <div className={`form-group ${full ? 'full' : ''}`}>
      <label className="form-label">{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--mut)', marginTop: 2, lineHeight: 1.4 }}>{hint}</span>}
    </div>
  )
}

function SectionDivider({ label }) {
  return (
    <div className="full" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: -2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function mkMeta(vertical, f) {
  if (vertical === 'cs2') {
    return {
      wear: f.wear,
      float: f.float !== '' ? parseFloat(f.float) : null,
      stattrak: f.stattrak === 'true',
      inspect_link: f.inspect_link.trim() || null,
      notes: f.notes.trim() || null,
    }
  }
  if (vertical === 'pokemon') {
    return {
      item_type: f.item_type,
      set_name: f.set_name.trim(),
      card_number: f.card_number.trim(),
      rarity: f.rarity || null,
      condition: f.condition,
      grade: f.grade,
      cert_number: f.cert_number.trim() || null,
      language: f.language,
      portfolio: f.portfolio,
      notes: f.notes.trim() || null,
    }
  }
  if (vertical === 'wine') {
    return {
      producer: f.producer.trim(),
      vintage: f.vintage ? parseInt(f.vintage) : null,
      region: f.region.trim(),
      appellation: f.appellation.trim() || null,
      format: f.format,
      lot_number: f.lot_number.trim() || null,
      bin_location: f.bin_location.trim() || null,
      drink_from: f.drink_from ? parseInt(f.drink_from) : null,
      drink_to: f.drink_to ? parseInt(f.drink_to) : null,
      storage_notes: f.storage_notes.trim() || null,
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
    inspect_link: m.inspect_link ?? '',
    cost: item?.cost != null ? String(item.cost) : '',
    value: item?.value != null && item.value > 0 ? String(item.value) : '',
    qty: item?.qty != null ? String(item.qty) : '1',
    notes: m.notes ?? '',
  }
  if (vertical === 'pokemon') return {
    name: item?.name ?? '',
    item_type: m.item_type ?? 'card',
    set_name: m.set_name ?? '',
    card_number: m.card_number ?? '',
    rarity: m.rarity ?? '',
    condition: m.condition ?? 'NM',
    grade: m.grade ?? 'Ungraded',
    cert_number: m.cert_number ?? '',
    language: m.language ?? 'EN',
    portfolio: m.portfolio ?? 'Main',
    cost: item?.cost != null ? String(item.cost) : '',
    value: item?.value != null && item.value > 0 ? String(item.value) : '',
    qty: item?.qty != null ? String(item.qty) : '1',
    notes: m.notes ?? '',
  }
  if (vertical === 'wine') return {
    name: item?.name ?? '',
    producer: m.producer ?? '',
    vintage: m.vintage != null ? String(m.vintage) : '',
    region: m.region ?? '',
    appellation: m.appellation ?? '',
    format: m.format ?? '750ml',
    lot_number: m.lot_number ?? '',
    bin_location: m.bin_location ?? '',
    drink_from: m.drink_from != null ? String(m.drink_from) : '',
    drink_to: m.drink_to != null ? String(m.drink_to) : '',
    cost: item?.cost != null ? String(item.cost) : '',
    value: item?.value != null && item.value > 0 ? String(item.value) : '',
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
      const qty = parseInt(f.qty, 10)
      if (!qty || qty < 1) { setError('Quantity must be at least 1'); setSaving(false); return }

      const floatVal = f.float !== '' ? parseFloat(f.float) : null
      if (floatVal != null && (isNaN(floatVal) || floatVal < 0 || floatVal > 1)) {
        setError('Float must be a number between 0 and 1'); setSaving(false); return
      }

      const cost = f.cost !== '' ? parseFloat(f.cost) : 0
      if (isNaN(cost) || cost < 0) { setError('Enter a valid purchase price'); setSaving(false); return }

      const payload = {
        vertical,
        name: f.name.trim(),
        cost,
        value: f.value !== '' ? parseFloat(f.value) : null,
        qty,
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
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color: vColor }}>
          {isEdit ? 'Edit' : 'Add'} {vLabel}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">

            {/* ── CS2 ── */}
            {vertical === 'cs2' && <>
              <SectionDivider label="Identity" />
              <Field label="Skin Name — exact Steam market name" full
                hint='Copy from Steam Market. Format: "Weapon | Skin Name (Wear)" e.g. AK-47 | Redline (Field-Tested)'>
                <input className="form-input" required value={f.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="AK-47 | Redline (Field-Tested)" />
              </Field>
              <Field label="Wear" hint="Determines price range">
                <select className="form-select" value={f.wear} onChange={e => set('wear', e.target.value)}>
                  {WEAR_OPTIONS.map(w => <option key={w} value={w}>{WEAR_LABELS[w]}</option>)}
                </select>
              </Field>
              <Field label="StatTrak™">
                <select className="form-select" value={f.stattrak} onChange={e => set('stattrak', e.target.value)}>
                  <option value="false">No</option>
                  <option value="true">Yes — StatTrak™</option>
                </select>
              </Field>
              <Field label="Float Value" hint="4 decimals. Found in CSGO Stash or from inspect link">
                <input className="form-input mono" type="number" step="0.0001" min="0" max="1"
                  value={f.float} onChange={e => set('float', e.target.value)} placeholder="0.1234" />
              </Field>
              <Field label="Inspect Link" full
                hint='In-game: right-click the skin → "Inspect in Game" → copy link. Starts with steam://rungame/730/...'>
                <input className="form-input mono" value={f.inspect_link}
                  onChange={e => set('inspect_link', e.target.value)}
                  placeholder="steam://rungame/730/…" style={{ fontSize: 11 }} />
              </Field>

              <SectionDivider label="Pricing" />
              <Field label="Purchase Price (€)" hint="What you paid">
                <input className="form-input mono" type="number" step="0.01" min="0" required
                  value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Current Value (€)" hint="Leave empty — auto-fetched from PriceEmpire">
                <input className="form-input mono" type="number" step="0.01" min="0"
                  value={f.value} onChange={e => set('value', e.target.value)} placeholder="Auto-fetched" />
              </Field>
              <Field label="Quantity">
                <input className="form-input mono" type="number" min="1"
                  value={f.qty} onChange={e => set('qty', e.target.value)} />
              </Field>
              <Field label="Notes" full>
                <textarea className="form-textarea" value={f.notes}
                  onChange={e => set('notes', e.target.value)} rows={2}
                  placeholder="Trade history, pending trade lock, etc." />
              </Field>
            </>}

            {/* ── POKÉMON ── */}
            {vertical === 'pokemon' && <>
              <SectionDivider label="Card Identity" />
              <Field label="Card Name" full
                hint="Exact English name as it appears on the card. Used for auto-price lookup.">
                <input className="form-input" required value={f.name}
                  onChange={e => set('name', e.target.value)} placeholder="Charizard" />
              </Field>
              <Field label="Set Name"
                hint='On the card bottom e.g. "Base Set", "Skyridge", "EX Deoxys"'>
                <input className="form-input" value={f.set_name}
                  onChange={e => set('set_name', e.target.value)} placeholder="Base Set" />
              </Field>
              <Field label="Card Number"
                hint='Printed bottom-right on card e.g. "4/102" or "007/195"'>
                <input className="form-input mono" value={f.card_number}
                  onChange={e => set('card_number', e.target.value)} placeholder="4/102" />
              </Field>
              <Field label="Rarity"
                hint="Printed as a symbol at card bottom. Hover options for descriptions.">
                <select className="form-select" value={f.rarity} onChange={e => set('rarity', e.target.value)}>
                  {RARITY_OPTIONS.map(r => <option key={r} value={r}>{r || '— Select rarity —'}</option>)}
                </select>
              </Field>
              <Field label="Language">
                <select className="form-select" value={f.language} onChange={e => set('language', e.target.value)}>
                  {LANG_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className="form-select" value={f.item_type} onChange={e => set('item_type', e.target.value)}>
                  {ITEM_TYPE_OPTIONS.map(t => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>

              <SectionDivider label="Condition & Grading" />
              <Field label="Condition (ungraded)"
                hint="NM = no visible wear. LP = minor edge wear. Only relevant if not in a graded slab.">
                <select className="form-select" value={f.condition} onChange={e => set('condition', e.target.value)}>
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
                </select>
              </Field>
              <Field label="Grade / Slab"
                hint="If graded: select the grade. If raw: leave Ungraded.">
                <select className="form-select" value={f.grade} onChange={e => set('grade', e.target.value)}>
                  {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Cert Number"
                hint="PSA/BGS/CGC cert number printed on the slab label. Lets you look up the card on their registry without opening anything.">
                <input className="form-input mono" value={f.cert_number}
                  onChange={e => set('cert_number', e.target.value)} placeholder="12345678" />
              </Field>

              <SectionDivider label="Collection" />
              <Field label="Portfolio">
                <select className="form-select" value={f.portfolio} onChange={e => set('portfolio', e.target.value)}>
                  {PORTFOLIO_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Notes" full>
                <textarea className="form-textarea" value={f.notes}
                  onChange={e => set('notes', e.target.value)} rows={2}
                  placeholder="Where you bought it, what binder/sleeve/case it's in…" />
              </Field>

              <SectionDivider label="Pricing" />
              <Field label="Purchase Price (€)" hint="What you paid">
                <input className="form-input mono" type="number" step="0.01" min="0" required
                  value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Current Value (€)"
                hint="Leave empty — auto-fetched from Cardmarket via pokemontcg.io">
                <input className="form-input mono" type="number" step="0.01" min="0"
                  value={f.value} onChange={e => set('value', e.target.value)} placeholder="Auto-fetched" />
              </Field>
              <Field label="Qty">
                <input className="form-input mono" type="number" min="1"
                  value={f.qty} onChange={e => set('qty', e.target.value)} />
              </Field>
            </>}

            {/* ── WINE ── */}
            {vertical === 'wine' && <>
              <SectionDivider label="Identity" />
              <Field label="Wine Name" full
                hint='The wine label name e.g. "Château Pétrus", "Barolo Cannubi", "Dom Pérignon"'>
                <input className="form-input" required value={f.name}
                  onChange={e => set('name', e.target.value)} placeholder="Château Pétrus" />
              </Field>
              <Field label="Producer"
                hint='The winery/estate e.g. "Pétrus", "Giacomo Conterno", "Moët & Chandon"'>
                <input className="form-input" value={f.producer}
                  onChange={e => set('producer', e.target.value)} placeholder="Pétrus" />
              </Field>
              <Field label="Vintage"
                hint="The harvest year printed on the label">
                <input className="form-input mono" type="number" min="1800" max="2099"
                  value={f.vintage} onChange={e => set('vintage', e.target.value)} placeholder="2015" />
              </Field>
              <Field label="Region"
                hint='Country/area e.g. "Bordeaux", "Piedmont", "Champagne", "Burgundy"'>
                <input className="form-input" value={f.region}
                  onChange={e => set('region', e.target.value)} placeholder="Bordeaux" />
              </Field>
              <Field label="Appellation"
                hint='Sub-region on label e.g. "Pomerol", "Barolo", "Nuits-Saint-Georges 1er Cru"'>
                <input className="form-input" value={f.appellation}
                  onChange={e => set('appellation', e.target.value)} placeholder="Pomerol" />
              </Field>
              <Field label="Format">
                <select className="form-select" value={f.format} onChange={e => set('format', e.target.value)}>
                  {FORMAT_OPTIONS.map(f2 => <option key={f2} value={f2}>{f2}</option>)}
                </select>
              </Field>
              <Field label="Lot / Batch Number"
                hint="Found on back label or capsule — identifies the exact production run. Useful for provenance.">
                <input className="form-input mono" value={f.lot_number}
                  onChange={e => set('lot_number', e.target.value)} placeholder="L2415" />
              </Field>

              <SectionDivider label="Storage Location" />
              <Field label="Bin / Rack Location" full
                hint='Where is this bottle right now? e.g. "Cave A · Rack 3 · Row 2 · Slot 7" or "Fridges · Top shelf · Left"'>
                <input className="form-input" value={f.bin_location}
                  onChange={e => set('bin_location', e.target.value)}
                  placeholder="Cave A · Rack 3 · Row 2" />
              </Field>
              <Field label="Drink From (year)"
                hint="Earliest recommended drinking year">
                <input className="form-input mono" type="number" min="2000" max="2099"
                  value={f.drink_from} onChange={e => set('drink_from', e.target.value)} placeholder="2025" />
              </Field>
              <Field label="Drink By (year)"
                hint="Latest recommended drinking year (peak window end)">
                <input className="form-input mono" type="number" min="2000" max="2099"
                  value={f.drink_to} onChange={e => set('drink_to', e.target.value)} placeholder="2040" />
              </Field>
              <Field label="Storage Notes" full>
                <textarea className="form-textarea" value={f.storage_notes}
                  onChange={e => set('storage_notes', e.target.value)} rows={2}
                  placeholder="Temperature, humidity, any damage to label or cork…" />
              </Field>

              <SectionDivider label="Pricing" />
              <Field label="Purchase Price (€)" hint="What you paid per bottle">
                <input className="form-input mono" type="number" step="0.01" min="0" required
                  value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Current Value (€)" hint="Check Wine-Searcher for current market price">
                <input className="form-input mono" type="number" step="0.01" min="0"
                  value={f.value} onChange={e => set('value', e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Qty" hint="Number of bottles">
                <input className="form-input mono" type="number" min="1"
                  value={f.qty} onChange={e => set('qty', e.target.value)} />
              </Field>
            </>}

          </div>

          {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: vColor, color: vertical === 'pokemon' ? '#000' : '#0b0d12' }}>
              {saving ? <span className="loading-spin" /> : isEdit ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
