import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { resolvedImageUploadAccept } from '@/lib/uploads'

const MAX_PHOTOS = 20

/** Job site photos chosen while creating a work order, shown as thumbnails before upload. */
export function JobSitePhotoPicker({ photos, onChange }: { photos: File[]; onChange: (photos: File[]) => void }) {
  const previews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo)), [photos])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Job site photos</p>
        <p className="text-xs text-muted-foreground">
          Show where they will work. Subcontractors see these photos with the offer, before they accept or decline.
        </p>
      </div>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="job-site-photos">
          {photos.map((photo, index) => (
            <li key={`${photo.name}-${photo.size}-${photo.lastModified}`} className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
              <img src={previews[index]} alt={photo.name} className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 shadow"
                aria-label={`Remove ${photo.name}`}
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <FilePickerButton
        accept={resolvedImageUploadAccept()}
        label={photos.length > 0 ? 'Add more photos' : 'Add photos'}
        size="sm"
        variant="outline"
        multiple
        selectedFiles={photos}
        onFiles={(selected) => onChange(selected.slice(0, MAX_PHOTOS))}
      />
      {photos.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {photos.length} photo{photos.length === 1 ? '' : 's'} · up to {MAX_PHOTOS}
        </p>
      ) : null}
    </div>
  )
}
