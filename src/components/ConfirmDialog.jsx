import { useEscapeKey } from '../lib/hooks.js'

export default function ConfirmDialog({ title, message, onConfirm, onCancel, dangerous }) {
  useEscapeKey(onCancel)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <p className="confirm-dialog-msg">{message}</p>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={`btn ${dangerous ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
