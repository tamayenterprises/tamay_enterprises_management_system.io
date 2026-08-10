import { useRef } from 'react'
import { Button } from '@/components/ui/button'
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
  /** Allow selecting more than one file (photos/docs), like an email attachment picker. */
  multiple?: boolean
  onFile?: (file: File) => void | Promise<void>
  onFiles?: (files: File[]) => void | Promise<void>
}

/** Button that opens the system file picker (hides the native Choose File control). */
export function FilePickerButton({
  accept,
  label = 'Upload file',
  loadingLabel = 'Uploading…',
  disabled,
  isLoading,
  className,
  size = 'sm',
  variant = 'default',
  multiple = false,
  onFile,
  onFiles,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const selected = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (selected.length === 0) return

          if (multiple || selected.length > 1) {
            if (onFiles) {
              await onFiles(selected)
              return
            }
            if (onFile) {
              for (const file of selected) {
                await onFile(file)
              }
            }
            return
          }

          if (onFiles) {
            await onFiles(selected)
            return
          }
          if (onFile) await onFile(selected[0]!)
        }}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn(className)}
        disabled={disabled || isLoading}
        onClick={() => inputRef.current?.click()}
      >
        {isLoading ? loadingLabel : label}
      </Button>
    </>
  )
}

export function selectedFilesLabel(files: File[], emptyLabel = 'No files selected') {
  if (files.length === 0) return emptyLabel
  if (files.length === 1) return files[0]!.name
  return `${files.length} files selected`
}
