import { useMemo, useRef } from 'react'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  fileKey,
  markNativeFilePickerClosed,
  markNativeFilePickerOpen,
  mergeSelectedFiles,
} from '@/components/ui/file-picker-helpers'

export { isNativeFilePickerOpen, selectedFilesLabel } from '@/components/ui/file-picker-helpers'
import { canUseDirectoryUpload } from '@/lib/uploads'
import { cn } from '@/lib/utils'
import type { VariantProps } from 'class-variance-authority'

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


/**
 * Native <label> + file input — more reliable on Android Chrome than
 * button.onClick → hiddenInput.click() (which often opens nothing).
 */
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
  const mobileFolderBrowse = directory && !nativeDirectory
  const allowMultiple = multiple || directory
  const blocked = Boolean(disabled || isLoading)

  const resolvedLabel =
    label ??
    (nativeDirectory
      ? 'Choose folder'
      : mobileFolderBrowse
        ? 'Pick folder files'
        : multiple
          ? 'Choose files'
          : 'Choose file')

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    const next =
      allowMultiple && append ? mergeSelectedFiles(selectedFiles, selected) : selected

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
  }

  return (
    <label
      className={cn(
        buttonVariants({
          variant,
          size,
        } as VariantProps<typeof buttonVariants>),
        'relative min-h-11 w-full cursor-pointer sm:w-auto',
        blocked && 'pointer-events-none opacity-50',
        className,
      )}
      onClick={() => {
        if (blocked) return
        markNativeFilePickerOpen()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={nativeDirectory || mobileFolderBrowse ? undefined : accept}
        multiple={allowMultiple ? true : undefined}
        // @ts-expect-error webkitdirectory is widely supported for folder picks on desktop
        webkitdirectory={nativeDirectory ? '' : undefined}
        disabled={blocked}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        // Keep the control accessible but avoid iOS zoom / layout issues
        style={{ fontSize: 16 }}
        onChange={async (event) => {
          const selected = Array.from(event.target.files ?? [])
          event.target.value = ''
          try {
            await handleFiles(selected)
          } finally {
            markNativeFilePickerClosed()
          }
        }}
        onCancel={() => {
          markNativeFilePickerClosed()
        }}
      />
      <span className="pointer-events-none">{isLoading ? loadingLabel : resolvedLabel}</span>
    </label>
  )
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
