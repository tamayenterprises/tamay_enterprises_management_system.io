/** App upload cap. Ensure Supabase Storage global limit is at least this high (Pro: Storage → Settings). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '100 MB'

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
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'text/rtf',
  // Mobile / desktop Files apps often report docs this way
  'application/octet-stream',
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
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.rtf',
])

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.rtf',
])

/** Photos + documents (legacy combined picker — prefer split pickers on mobile). */
export const UPLOAD_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,application/pdf,image/*'

export const IMAGE_UPLOAD_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif'

/** Documents only — keeps mobile pickers out of the Photos-only UI. */
export const DOCUMENT_UPLOAD_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv'

export function fileExtension(file: File) {
  const name = file.name || ''
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot).toLowerCase()
}

export function isImageUploadFile(file: File): boolean {
  const extension = fileExtension(file)
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)
}

export function isDocumentUploadFile(file: File): boolean {
  if (isImageUploadFile(file)) return false
  const extension = fileExtension(file)
  if (DOCUMENT_EXTENSIONS.has(extension)) return true
  if (!file.type || file.type === 'application/octet-stream') return DOCUMENT_EXTENSIONS.has(extension)
  return (
    file.type.startsWith('application/') ||
    file.type.startsWith('text/') ||
    ALLOWED_MIME_TYPES.has(file.type)
  )
}

/** Auto category from the file itself — no type dropdown needed. */
export function categoryForUploadFile(file: File): 'work_photo' | 'project_file' {
  return isImageUploadFile(file) ? 'work_photo' : 'project_file'
}

/** Guess a storage content-type when the browser leaves MIME blank. */
export function contentTypeForUploadFile(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  switch (fileExtension(file)) {
    case '.pdf':
      return 'application/pdf'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.ppt':
      return 'application/vnd.ms-powerpoint'
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case '.txt':
      return 'text/plain'
    case '.csv':
      return 'text/csv'
    case '.rtf':
      return 'application/rtf'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.heic':
      return 'image/heic'
    case '.heif':
      return 'image/heif'
    default:
      return file.type || 'application/octet-stream'
  }
}

/** Pick a document category that matches the file (PDFs/docs never become work photos). */
export function resolveUploadCategory<T extends string>(file: File, preferred: T): T | 'project_file' | 'work_photo' {
  if (isImageUploadFile(file)) {
    return preferred === 'work_photo' ? 'work_photo' : preferred
  }
  if (preferred === 'work_photo') return 'project_file'
  return preferred
}

export function formatUploadBytes(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 10) return `${Math.round(mb)} MB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${Math.max(1, Math.round(kb))} KB`
}

export function validateImageUploadFile(file: File): string | null {
  const baseError = validateUploadFile(file)
  if (baseError) return baseError

  if (!isImageUploadFile(file)) return 'Please choose a photo (JPG, PNG, WEBP, or HEIC).'
  return null
}

export function validateUploadFile(file: File): string | null {
  if (file.size <= 0) return `“${file.name || 'File'}” is empty.`
  if (file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name || 'File'}” is ${formatUploadBytes(file.size)}. Each file must be ${MAX_UPLOAD_LABEL} or smaller.`
  }

  const extension = fileExtension(file)
  const mime = file.type || ''
  const mimeOk =
    !mime ||
    mime === 'application/octet-stream' ||
    ALLOWED_MIME_TYPES.has(mime) ||
    mime.startsWith('image/') ||
    mime.startsWith('text/')
  const extOk = ALLOWED_EXTENSIONS.has(extension)

  // Prefer extension when MIME is missing/generic (common on phones).
  if (extOk) return null
  if (mimeOk && mime.startsWith('image/')) return null

  return `“${file.name || 'File'}” isn’t a supported type. Use PDF, Word, Excel, PowerPoint, text/CSV, or common image formats.`
}

/** Friendly message when storage rejects an oversized upload. */
export function uploadErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message || 'Upload failed')
        : 'Upload failed'
  if (/payload too large|entity too large|\b413\b|maximum allowed size|file size|too large/i.test(message)) {
    return `That file is too large. Each file must be ${MAX_UPLOAD_LABEL} or smaller.`
  }
  return message
}

export function isUploadSizeLimitMessage(message: string) {
  return new RegExp(`must be ${MAX_UPLOAD_LABEL}|too large|${MAX_UPLOAD_LABEL} or smaller`, 'i').test(
    message,
  )
}

/** Validate a batch before upload/staging; oversized files are rejected with clear errors. */
export function partitionUploadFiles(
  files: File[],
  options?: { imagesOnly?: boolean; documentsOnly?: boolean },
) {
  const accepted: File[] = []
  const errors: string[] = []

  for (const file of files) {
    if (options?.imagesOnly && !isImageUploadFile(file)) {
      errors.push(`“${file.name || 'File'}” isn’t a photo. Use JPG, PNG, WEBP, or HEIC.`)
      continue
    }
    if (options?.documentsOnly && isImageUploadFile(file)) {
      errors.push(`“${file.name || 'File'}” is a photo. Use the photo uploader for images.`)
      continue
    }
    const validationError = options?.imagesOnly
      ? validateImageUploadFile(file)
      : validateUploadFile(file)
    if (validationError) {
      errors.push(validationError)
      continue
    }
    accepted.push(file)
  }

  return { accepted, errors }
}

/** True on phones/tablets where webkitdirectory folder pick is unreliable or missing. */
export function isMobileUploadDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/** Desktop-only true folder picker; mobile uses multi-file browse into a folder instead. */
export function canUseDirectoryUpload() {
  return !isMobileUploadDevice()
}

/**
 * On mobile, omit `accept` so the Files app opens (long MIME lists often break PDF picks).
 * Validation still runs in validateUploadFile after selection.
 */
export function resolvedDocumentUploadAccept(): string | undefined {
  if (isMobileUploadDevice()) return undefined
  return DOCUMENT_UPLOAD_ACCEPT
}

export function confirmAction(message: string) {
  return window.confirm(message)
}

/** Call at render time so the hint matches phone vs desktop. */
export function uploadFolderHint() {
  if (isMobileUploadDevice()) {
    return `Max ${MAX_UPLOAD_LABEL} per file. On your phone: tap Pick folder files, open the folder in Files, tap Select / Select All, then Done.`
  }
  return `Max ${MAX_UPLOAD_LABEL} per file. Phone: use Pick folder files (open folder → Select All). Desktop: use Choose folder, or multi-select files.`
}

export function uploadSizeHint() {
  return `Max ${MAX_UPLOAD_LABEL} per file`
}

/** @deprecated Prefer uploadFolderHint() at render time */
export const UPLOAD_FOLDER_HINT =
  'On phones: Pick folder files → open folder in Files → Select All → Done. On desktop: Choose folder works too.'

