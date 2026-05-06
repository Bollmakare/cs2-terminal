import { useState, useRef, useCallback } from 'react'
import { useEscapeKey } from '../lib/hooks.js'
import { addPhotoToItem, removePhotoFromItem, MAX_PHOTOS } from '../lib/storage.js'
import { useToast } from './Toast.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

function Lightbox({ images, startIndex, onClose, onDelete }) {
  const [idx, setIdx] = useState(startIndex)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function prev() { setIdx(i => (i - 1 + images.length) % images.length) }
  function next() { setIdx(i => (i + 1) % images.length) }

  function handleKey(e) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft') prev()
    if (e.key === 'ArrowRight') next()
  }

  return (
    <>
      <div className="lightbox-overlay" tabIndex={0} onKeyDown={handleKey} onClick={onClose} style={{ outline: 'none' }}>
        <img
          className="lightbox-img"
          src={images[idx]}
          alt=""
          onClick={e => e.stopPropagation()}
        />
        {images.length > 1 && <>
          <button className="lightbox-nav left" onClick={e => { e.stopPropagation(); prev() }}>‹</button>
          <button className="lightbox-nav right" onClick={e => { e.stopPropagation(); next() }}>›</button>
        </>}
        <button className="lightbox-close" onClick={onClose}>×</button>
        <div className="lightbox-counter">{idx + 1} / {images.length}</div>
        {onDelete && (
          <div className="lightbox-delete" onClick={e => e.stopPropagation()}>
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete photo</button>
          </div>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete photo"
          message="Remove this photo permanently?"
          dangerous
          onConfirm={() => { setConfirmDelete(false); onDelete(images[idx]) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

export default function ImageModal({ item, userId, onClose, onUpdate }) {
  const toast = useToast()
  useEscapeKey(onClose)
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [drag, setDrag] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [localItem, setLocalItem] = useState(item)

  const images = localItem.metadata?.images ?? []
  const isPokemon = localItem.vertical === 'pokemon'
  const slotLabels = isPokemon ? ['Front', 'Back'] : []

  async function handleFiles(files) {
    const remaining = MAX_PHOTOS - images.length
    if (remaining <= 0) { toast('Maximum 4 photos reached', 'error'); return }
    const toUpload = Array.from(files).slice(0, remaining)
    setUploading(true)
    try {
      let current = localItem
      for (const f of toUpload) {
        setProgress(0)
        const updated = await addPhotoToItem(current, userId, f, p => setProgress(p))
        current = updated
        setLocalItem(updated)
        onUpdate?.(updated)
      }
      toast('Photos uploaded', 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function handleDelete(url) {
    try {
      const updated = await removePhotoFromItem(localItem, url)
      setLocalItem(updated)
      onUpdate?.(updated)
      setLightbox(null)
      toast('Photo removed', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDrag(false)
    handleFiles(e.dataTransfer.files)
  }

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => images[i] ?? null)

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal image-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <div className="modal-title">Photos — {localItem.name}</div>

          <div className="photo-counter">{images.length} / {MAX_PHOTOS}</div>

          <div className="photo-grid">
            {slots.map((url, i) => (
              <div key={i} className="photo-slot">
                {url ? (
                  <>
                    <img src={url} alt="" onClick={() => setLightbox(i)} />
                    <button className="photo-delete" onClick={() => handleDelete(url)}>×</button>
                    {slotLabels[i] && <div className="photo-slot-label">{slotLabels[i]}</div>}
                  </>
                ) : (
                  <div className="photo-slot-empty">
                    {slotLabels[i] ? slotLabels[i][0] : '+'}
                  </div>
                )}
              </div>
            ))}
          </div>

          {images.length < MAX_PHOTOS && (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="dropzone-text">Drop photos here or click to browse</div>
                <div className="dropzone-sub">Compressed to max 300 KB · 1200 px wide</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)}
              />
            </>
          )}

          {uploading && (
            <div className="upload-progress">
              <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox
          images={images}
          startIndex={lightbox}
          onClose={() => setLightbox(null)}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
