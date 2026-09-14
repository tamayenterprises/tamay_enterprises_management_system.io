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

export type PreparedUpload = {
  /** Always the original browser File — never a cloned File (Android content:// breaks on clone). */
  file: File
  displayName: string
  contentType: string
}

export function fileExtension(file: File) {
  return extensionFromName(file.name || '')
}

function extensionFromName(name: string) {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot).toLowerCase()
}

function extensionForMime(type: string) {
  switch (type) {
    case 'application/pdf':
      return '.pdf'
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/heic':
      return '.heic'
    case 'image/heif':
      return '.heif'
    case 'application/msword':
      return '.doc'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx'
    case 'application/vnd.ms-excel':
      return '.xls'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return '.xlsx'
    case 'application/vnd.ms-powerpoint':
      return '.ppt'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return '.pptx'
    case 'text/plain':
      return '.txt'
    case 'text/csv':
      return '.csv'
    case 'application/rtf':
    case 'text/rtf':
      return '.rtf'
    default:
      return ''
  }
}

export function isImageUploadFile(file: File): boolean {
  const extension = fileExtension(file)
  const mime = (file.type || '').toLowerCase()
  return mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)
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

function isKnownMime(mime: string) {
  return (
    Boolean(mime) &&
    mime !== 'application/octet-stream' &&
    (ALLOWED_MIME_TYPES.has(mime) || mime.startsWith('image/') || mime.startsWith('text/'))
  )
}

/** Sniff common file signatures when Android omits MIME and extension. */
export async function sniffUploadKind(file: File): Promise<{ mime: string; ext: string } | null> {
  try {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (header.length >= 4 && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
      return { mime: 'application/pdf', ext: '.pdf' }
    }
    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return { mime: 'image/jpeg', ext: '.jpg' }
    }
    if (
      header.length >= 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return { mime: 'image/png', ext: '.png' }
    }
    if (
      header.length >= 12 &&
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50
    ) {
      return { mime: 'image/webp', ext: '.webp' }
    }
    // ZIP-based Office (docx/xlsx/pptx) — treat as generic zip doc if name hints
    if (header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b) {
      const lower = (file.name || '').toLowerCase()
      if (lower.includes('sheet') || lower.endsWith('.xlsx')) {
        return {
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ext: '.xlsx',
        }
      }
      if (lower.includes('presentation') || lower.endsWith('.pptx')) {
        return {
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          ext: '.pptx',
        }
      }
      return {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: '.docx',
      }
    }
  } catch {
    /* ignore sniff failures */
  }
  return null
}

export function validateImageUploadFile(file: File): string | null {
  const baseError = validateUploadFile(file)
  if (baseError) return baseError

  if (!isImageUploadFile(file)) return 'Please choose a photo (JPG, PNG, WEBP, or HEIC).'
  return null
}

export function validateUploadFile(file: File): string | null {
  const extension = fileExtension(file)
  const mime = (file.type || '').toLowerCase()
  const knownMime = isKnownMime(mime)
  const extOk = ALLOWED_EXTENSIONS.has(extension)

  if (file.size < 0) return `“${file.name || 'File'}” is empty.`
  // Truly empty with no metadata
  if (file.size === 0 && !knownMime && !extOk) {
    return `“${file.name || 'File'}” is empty or could not be read. Try Download/Save a copy, then upload again.`
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name || 'File'}” is ${formatUploadBytes(file.size)}. Each file must be ${MAX_UPLOAD_LABEL} or smaller.`
  }

  if (extOk || knownMime) return null

  // Android Drive/Files often sends bytes with blank MIME and no extension.
  // Allow the pick through; prepareUploadFile will sniff or fall back to octet-stream.
  if (file.size > 0 && (!mime || mime === 'application/octet-stream')) {
    return null
  }

  return `“${file.name || 'File'}” isn’t a supported type. Use PDF, Word, Excel, PowerPoint, text/CSV, or common image formats.`
}

/**
 * Resolve display name + content type WITHOUT cloning the File.
 * Cloning with `new File([file], …)` breaks many Android content:// picks.
 */
export function prepareUploadFile(file: File, sniffed?: { mime: string; ext: string } | null): PreparedUpload {
  let displayName = file.name?.trim() || 'upload'
  let contentType = (file.type || '').toLowerCase()

  if (sniffed) {
    contentType = sniffed.mime
    if (!extensionFromName(displayName)) displayName = `${displayName}${sniffed.ext}`
  }

  if (!extensionFromName(displayName) && isKnownMime(contentType)) {
    const ext = extensionForMime(contentType)
    if (ext) displayName = `${displayName}${ext}`
  }

  if (!isKnownMime(contentType) && extensionFromName(displayName)) {
    contentType = contentTypeForUploadFile(new File([], displayName, { type: '' }))
  }

  if (!contentType || contentType === 'application/octet-stream') {
    contentType = contentTypeForUploadFile(new File([], displayName, { type: file.type || '' }))
  }

  return {
    file,
    displayName,
    contentType: contentType || 'application/octet-stream',
  }
}

/** Async prepare with magic-byte sniff for opaque Android picks. */
export async function prepareUploadFileAsync(file: File): Promise<PreparedUpload> {
  const needsSniff =
    file.size > 0 &&
    (!file.type || file.type === 'application/octet-stream' || !extensionFromName(file.name || ''))

  const sniffed = needsSniff ? await sniffUploadKind(file) : null
  const prepared = prepareUploadFile(file, sniffed)

  // Last-resort size check: some Android picks report 0 until read.
  if (prepared.file.size === 0) {
    try {
      const bytes = await file.arrayBuffer()
      if (bytes.byteLength === 0) {
        throw new Error(
          `“${prepared.displayName}” is empty or could not be read. Try Download/Save a copy, then upload again.`,
        )
      }
      // Keep original file reference for upload; size reported to DB can use bytes length.
      return { ...prepared, file }
    } catch (error) {
      if (error instanceof Error && /empty or could not be read/i.test(error.message)) throw error
      throw new Error(
        `“${prepared.displayName}” could not be read from this device. Try saving it to Downloads first.`,
      )
    }
  }

  return prepared
}

/** @deprecated Prefer prepareUploadFile — kept for older call sites. Does not clone. */
export function normalizeUploadFile(file: File): File {
  // Intentionally return the original File. Renaming is handled via prepareUploadFile.displayName.
  return file
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
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'Upload failed due to a network error. Check your connection and try again.'
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
      // Opaque Android picks (no MIME/ext) — allow through for sniffing at upload time
      const opaque = file.size > 0 && (!file.type || file.type === 'application/octet-stream') && !fileExtension(file)
      if (!opaque) {
        errors.push(`“${file.name || 'File'}” isn’t a photo. Use JPG, PNG, WEBP, or HEIC.`)
        continue
      }
    }
    if (options?.documentsOnly && isImageUploadFile(file)) {
      errors.push(`“${file.name || 'File'}” is a photo. Use the photo uploader for images.`)
      continue
    }
    const validationError = options?.imagesOnly
      ? // For opaque picks, skip strict image check until sniff
        file.size > 0 && (!file.type || file.type === 'application/octet-stream') && !fileExtension(file)
        ? validateUploadFile(file)
        : validateImageUploadFile(file)
      : validateUploadFile(file)
    if (validationError) {
      errors.push(validationError)
      continue
    }
    accepted.push(file)
  }

  return { accepted, errors }
}

/** Simpler accept list — Android Chrome mishandles long HEIC MIME lists. */
export function resolvedImageUploadAccept(): string | undefined {
  if (isMobileUploadDevice()) return 'image/*'
  return IMAGE_UPLOAD_ACCEPT
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
    return `Max ${MAX_UPLOAD_LABEL} per file. Tip on Android: if Drive fails, open the file → ⋮ → Download, then upload from Downloads.`
  }
  return `Max ${MAX_UPLOAD_LABEL} per file. Phone: use Pick folder files (open folder → Select All). Desktop: use Choose folder, or multi-select files.`
}

export function uploadSizeHint() {
  return `Max ${MAX_UPLOAD_LABEL} per file`
}

/** @deprecated Prefer uploadFolderHint() at render time */
export const UPLOAD_FOLDER_HINT =
  'On phones: Pick folder files → open folder in Files → Select All → Done. On desktop: Choose folder works too.'
