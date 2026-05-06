import imageCompression from 'browser-image-compression'
import { supabase } from './supabase.js'
import { updateItem } from './api.js'

const BUCKET = 'item-images'
const MAX_PHOTOS = 4

export async function uploadPhoto(file, userId, itemId, onProgress) {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    onProgress,
  })

  const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
  const path = `${userId}/${itemId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: compressed.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw error

  return getPublicUrl(path)
}

export function getPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export function pathFromUrl(url) {
  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  return idx >= 0 ? url.slice(idx + marker.length) : url
}

export async function deletePhoto(url) {
  const path = pathFromUrl(url)
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function addPhotoToItem(item, userId, file, onProgress) {
  const images = item.metadata?.images ?? []
  if (images.length >= MAX_PHOTOS) throw new Error('Max 4 photos per item')
  const url = await uploadPhoto(file, userId, item.id, onProgress)
  const newImages = [...images, url]
  return await updateItem(item.id, { metadata: { ...item.metadata, images: newImages } })
}

export async function removePhotoFromItem(item, url) {
  await deletePhoto(url)
  const newImages = (item.metadata?.images ?? []).filter(u => u !== url)
  return await updateItem(item.id, { metadata: { ...item.metadata, images: newImages } })
}

export { MAX_PHOTOS }
