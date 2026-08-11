const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
])

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

export const UPLOAD_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,application/pdf,image/*'

export const IMAGE_UPLOAD_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif'

export function isImageUploadFile(file: File): boolean {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)
}

/** Pick a document category that matches the file (PDFs/docs never become work photos). */
export function resolveUploadCategory<T extends string>(file: File, preferred: T): T | 'project_file' | 'work_photo' {
  if (isImageUploadFile(file)) {
    return preferred === 'work_photo' ? 'work_photo' : preferred
  }
  if (preferred === 'work_photo') return 'project_file'
  return preferred
}

export function validateImageUploadFile(file: File): string | null {
  const baseError = validateUploadFile(file)
  if (baseError) return baseError

  if (!isImageUploadFile(file)) return 'Please choose a photo (JPG, PNG, WEBP, or HEIC).'
  return null
}

export function validateUploadFile(file: File): string | null {
  if (file.size <= 0) return 'The selected file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'File must be 15 MB or smaller.'

  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  const mimeOk = !file.type || ALLOWED_MIME_TYPES.has(file.type) || file.type.startsWith('image/')
  const extOk = ALLOWED_EXTENSIONS.has(extension)

  if (!mimeOk && !extOk) {
    return 'Unsupported file type. Use PDF, Word, Excel, or common image formats.'
  }

  return null
}

export function confirmAction(message: string) {
  return window.confirm(message)
}
