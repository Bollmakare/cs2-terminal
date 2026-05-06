import { useState } from 'react'

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
  const isEmpty = !rows || rows.length === 0

  function toggleAll(e) {
    if (e.target.checked) onSelectChange(rows.map(r => r.id))
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
                  checked={!isEmpty && selected?.length === rows.length}
                  ref={el => { if (el) el.indeterminate = selected?.length > 0 && selected.length < rows.length }}
                />
              </th>
            )}
            {columns.map(c => (
              <th key={c.key} style={c.style}>{c.label}</th>
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
          ) : rows.map(row => (
            <tr key={row.id}>
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
                  {onEdit && (
                    <button className="btn-icon" title="Edit" onClick={() => onEdit(row)}>✎</button>
                  )}
                  {onPhoto && (
                    <button className="btn-icon" title="Photos" onClick={() => onPhoto(row)}>🖼</button>
                  )}
                  {extraActions?.(row)}
                  {onDelete && (
                    <button className="btn-icon danger" title="Delete" onClick={() => onDelete(row)}>✕</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
