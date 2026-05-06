import { useState, useMemo } from 'react'

export default function ItemTable({
  columns,
  rows,
  onEdit,
  onDelete,
  onPhoto,
  extraActions,
  selectable,
  selected,
  onSelectChange,
  emptyMessage,
}) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows ?? []
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return rows ?? []
    return [...(rows ?? [])].sort((a, b) => {
      const av = col.sortValue(a) ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = col.sortValue(b) ?? (sortDir === 'asc' ? Infinity : -Infinity)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, sortKey, sortDir, columns])

  const isEmpty = sorted.length === 0

  function toggleAll(e) {
    if (e.target.checked) onSelectChange(sorted.map(r => r.id))
    else onSelectChange([])
  }

  function toggleOne(id, checked) {
    if (checked) onSelectChange([...(selected ?? []), id])
    else onSelectChange((selected ?? []).filter(x => x !== id))
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  className="cb"
                  onChange={toggleAll}
                  checked={!isEmpty && selected?.length === sorted.length}
                  ref={el => { if (el) el.indeterminate = selected?.length > 0 && selected.length < sorted.length }}
                />
              </th>
            )}
            {columns.map(c => (
              <th
                key={c.key}
                style={c.style}
                className={c.sortValue ? 'sortable' : ''}
                onClick={c.sortValue ? () => handleSort(c.key) : undefined}
              >
                {c.label}
                {c.sortValue && (
                  <span className={`sort-icon${sortKey === c.key ? ' active' : ''}`}>
                    {sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                  </span>
                )}
              </th>
            ))}
            <th style={{ width: 90 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length + 1 + (selectable ? 1 : 0)} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mut)' }}>
                {emptyMessage ?? 'No items yet.'}
              </td>
            </tr>
          ) : sorted.map(row => (
            <tr key={row.id} className={row._isSubRow ? 'sub-row' : ''}>
              {selectable && (
                <td>
                  <input
                    type="checkbox"
                    className="cb"
                    checked={selected?.includes(row.id) ?? false}
                    onChange={e => toggleOne(row.id, e.target.checked)}
                  />
                </td>
              )}
              {columns.map(c => (
                <td key={c.key} style={c.tdStyle}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
              <td>
                <div className="action-btns">
                  {onEdit && !row._isGroup && <button className="btn-icon" title="Edit" onClick={() => onEdit(row)}>✎</button>}
                  {onPhoto && !row._isGroup && <button className="btn-icon" title="Photos" onClick={() => onPhoto(row)}>🖼</button>}
                  {extraActions?.(row)}
                  {onDelete && !row._isGroup && <button className="btn-icon danger" title="Delete" onClick={() => onDelete(row)}>✕</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
