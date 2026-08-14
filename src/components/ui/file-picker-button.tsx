import { useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { canUseDirectoryUpload } from '@/lib/uploads'
import { cn } from '@/lib/utils'

type FilePickerButtonProps = {
  accept?: string
  label?: string
  loadingLabel?: string
  disabled?: boolean
  isLoading?: boolean
  className?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  /**
   * Allow selecting more than one file in the system picker (Ctrl/Cmd or Shift click,
   * or multi-select on mobile). Defaults to true.
   */
  multiple?: boolean
  /**
   * When multiple is on, merge newly picked files into any already staged files
   * instead of replacing them. Defaults to true.
   */
  append?: boolean
  /**
   * Prefer picking an entire folder on desktop (webkitdirectory).
   * On mobile, falls back to multi-file browse so users can open a folder in Files
   * and Select All — browsers cannot upload a folder as one object on iOS/Android.
   */
  directory?: boolean
  /** Currently staged files — used so "Add more" can merge with prior picks. */
  selectedFiles?: File[]
  onFile?: (file: File) => void | Promise<void>
  onFiles?: (files: File[]) => void | Promise<void>
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

/** Button that opens the system file picker (hides the native Choose File control). */
export function FilePickerButton({
  accept,
  label,
  loadingLabel = 'Uploading…',
  disabled,
  isLoading,
  className,
  size = 'default',
  variant = 'default',
  multiple = true,
  append = true,
  directory = false,
  selectedFiles = [],
  onFile,
  onFiles,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const nativeDirectory = useMemo(
    () => directory && canUseDirectoryUpload(),
    [directory],
  )
  // Mobile "folder" = multi-file with no accept filter (browse into folder in Files).
  const mobileFolderBrowse = directory && !nativeDirectory
  const allowMultiple = multiple || directory

  const resolvedLabel =
    label ??
    (nativeDirectory
      ? 'Choose folder'
      : mobileFolderBrowse
        ? 'Pick folder files'
        : multiple
          ? 'Choose files'
          : 'Choose file')

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={nativeDirectory || mobileFolderBrowse ? undefined : accept}
        // Explicit true so the HTML multiple attribute is always present when enabled.
        multiple={allowMultiple ? true : undefined}
        // @ts-expect-error webkitdirectory is widely supported for folder picks on desktop
        webkitdirectory={nativeDirectory ? '' : undefined}
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const selected = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (selected.length === 0) return

          const next =
            allowMultiple && append
              ? mergeSelectedFiles(selectedFiles, selected)
              : selected

          if (onFiles) {
            await onFiles(next)
            return
          }
          if (onFile) {
            if (allowMultiple) {
              for (const file of next) await onFile(file)
            } else {
              await onFile(next[0]!)
            }
          }
        }}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn('min-h-11 w-full sm:w-auto', className)}
        disabled={disabled || isLoading}
        onClick={() => inputRef.current?.click()}
      >
        {isLoading ? loadingLabel : resolvedLabel}
      </Button>
    </>
  )
}

export function selectedFilesLabel(files: File[], emptyLabel = 'No files selected') {
  if (files.length === 0) return emptyLabel
  if (files.length === 1) return files[0]!.name
  return `${files.length} files selected`
}

/** Removable list of staged files before upload. */
export function SelectedFilesList({
  files,
  onChange,
  className,
}: {
  files: File[]
  onChange: (files: File[]) => void
  className?: string
}) {
  if (files.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      <ul className="max-h-36 overflow-y-auto rounded-md border border-border bg-[#fbfcff] px-2 py-1.5 text-sm">
        {files.map((file) => (
          <li
            key={fileKey(file)}
            className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-b-0"
          >
            <span className="min-w-0 truncate text-xs sm:text-sm">{file.name}</span>
            <button
              type="button"
              className="inline-flex min-h-10 shrink-0 items-center px-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => onChange(files.filter((item) => fileKey(item) !== fileKey(file)))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {files.length > 1 ? (
        <button
          type="button"
          className="inline-flex min-h-10 items-center text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => onChange([])}
        >
          Clear all {files.length} files
        </button>
      ) : null}
    </div>
  )
}
