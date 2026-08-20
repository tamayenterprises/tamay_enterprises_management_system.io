export function markNativeFilePickerOpen() {
  if (typeof document === 'undefined') return
  document.body.dataset.nativeFilePicker = '1'
}

export function markNativeFilePickerClosed() {
  if (typeof document === 'undefined') return
  window.setTimeout(() => {
    delete document.body.dataset.nativeFilePicker
  }, 500)
}

export function isNativeFilePickerOpen() {
  if (typeof document === 'undefined') return false
  return document.body.dataset.nativeFilePicker === '1'
}

export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** Merge newly picked files into an existing staged list (deduped). */
export function mergeSelectedFiles(existing: File[], incoming: File[]) {
  const map = new Map(existing.map((file) => [fileKey(file), file]))
  for (const file of incoming) map.set(fileKey(file), file)
  return Array.from(map.values())
}

export function selectedFilesLabel(files: File[], emptyLabel = 'No files selected') {
  if (files.length === 0) return emptyLabel
  if (files.length === 1) return files[0]!.name
  return `${files.length} files selected`
}
