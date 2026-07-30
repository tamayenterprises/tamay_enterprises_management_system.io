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
  onFile: (file: File) => void | Promise<void>
}

/** Single button that opens the system file picker (hides the native Choose File control). */
export function FilePickerButton({
  accept,
  label = 'Upload file',
  loadingLabel = 'Uploading…',
  disabled,
  isLoading,
  className,
  size = 'sm',
  variant = 'default',
  onFile,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          await onFile(file)
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
