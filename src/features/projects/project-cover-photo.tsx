import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { useProjectCoverUrl } from '@/features/projects/my-projects-hooks'
import { selectProjectCover, type ProjectPhoto } from '@/features/projects/my-projects-model'
import { useSetProjectCover, useUploadProjectCover } from '@/features/projects/project-cover-hooks'
import { isProjectCoverEligible, isProjectPhotoDocument } from '@/lib/document-visibility'
import { formatUnknownError } from '@/lib/auth-errors'
import { isImageUploadFile, resolvedImageUploadAccept } from '@/lib/uploads'
import { cn } from '@/lib/utils'
import type { DocumentRecord, Project } from '@/types/database'

function CoverThumb({ photo, className }: { photo: ProjectPhoto | null; className?: string }) {
  const url = useProjectCoverUrl(photo)
  const [broken, setBroken] = useState(false)
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-md bg-primary', className)}>
      {photo && url.data && !broken ? (
        <img
          src={url.data}
          alt={photo.name ? `Photo ${photo.name}` : 'Project photo'}
          loading="lazy"
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#145079_0%,#0b3c5d_55%,#082c45_100%)]">
          <img src="/tamay-logo.png" alt="" className="h-7 w-7 rounded-full bg-white object-contain p-0.5" />
        </div>
      )}
    </div>
  )
}

/**
 * Management-only "Project cover photo" control for the Photos section of Project Detail.
 * The cover is the thumbnail employees see on My Projects.
 */
export function ProjectCoverPhoto({ project, documents }: { project: Project; documents: DocumentRecord[] }) {
  const [open, setOpen] = useState(false)
  const setCover = useSetProjectCover(project.id)
  const uploadCover = useUploadProjectCover(project.id)
  const busy = setCover.isPending || uploadCover.isPending

  const photos = useMemo(() => documents.filter(isProjectPhotoDocument), [documents])
  const eligible = useMemo(
    () => photos.filter(isProjectCoverEligible).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [photos],
  )
  const { cover, coverSource } = useMemo(
    () => selectProjectCover(photos, project.cover_photo_document_id),
    [photos, project.cover_photo_document_id],
  )
  const explicit = coverSource === 'explicit'
  const staleChoice = Boolean(project.cover_photo_document_id) && !explicit

  const status = explicit
    ? 'Chosen by management'
    : staleChoice
      ? 'The chosen cover is no longer available. Using automatic project photo.'
      : coverSource === 'work_photo'
        ? 'Using automatic project photo (latest work photo)'
        : coverSource === 'reference'
          ? 'Using automatic project photo (reference image)'
          : 'Using automatic project photo. No eligible photos yet, so the Tamay logo is shown.'

  async function choose(documentId: string | null, done: string) {
    try {
      await setCover.mutateAsync(documentId)
      toast.success(done)
    } catch (error) {
      toast.error(formatUnknownError(error, 'Could not update the project cover'))
    }
  }

  async function upload(file: File) {
    if (!isImageUploadFile(file)) {
      toast.error('Cover photos must be image files (JPG, PNG, WEBP, or HEIC).')
      return
    }
    try {
      await uploadCover.upload(file)
      toast.success('Cover photo uploaded and set')
      setOpen(false)
    } catch (error) {
      toast.error(formatUnknownError(error, 'Could not upload the cover photo'))
    }
  }

  return (
    <section data-testid="project-cover-photo" className="rounded-md border border-border px-3 py-2.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CoverThumb photo={cover} className="h-14 w-20" />
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-wide">PROJECT COVER PHOTO</p>
            <p className="text-xs text-muted-foreground">{status}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
            {explicit ? 'Change Cover Photo' : 'Choose Cover Photo'}
          </Button>
          {project.cover_photo_document_id ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void choose(null, 'Using automatic cover')}
            >
              Use Automatic Cover
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Project cover photo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The cover identifies this project on My Projects. Only project photos can be used, never
            documents, receipts, contracts or IDs. Newer photos will not replace your choice.
          </p>
          <div className="flex flex-wrap gap-2">
            <FilePickerButton
              accept={resolvedImageUploadAccept()}
              multiple={false}
              label="Upload Cover Photo"
              loadingLabel="Uploading…"
              size="sm"
              variant="outline"
              isLoading={uploadCover.isPending}
              disabled={busy}
              onFile={upload}
            />
            {project.cover_photo_document_id ? (
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => void choose(null, 'Using automatic cover')}
              >
                Use Automatic Cover
              </Button>
            ) : null}
          </div>

          {eligible.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No project photos yet. Upload a cover photo to get started.
            </p>
          ) : (
            <ul aria-label="Eligible project photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {eligible.map((photo) => {
                const current = explicit && cover?.id === photo.id
                return (
                  <li
                    key={photo.id}
                    className={cn(
                      'overflow-hidden rounded-lg border bg-white',
                      current ? 'border-accent ring-2 ring-accent/40' : 'border-border',
                    )}
                  >
                    <CoverThumb photo={photo} className="aspect-[4/3] w-full rounded-none" />
                    <div className="space-y-2 p-2">
                      <p className="truncate text-xs text-muted-foreground" title={photo.name}>
                        {photo.kind_label || 'Photo'} · {format(new Date(photo.created_at), 'MMM d, yyyy')}
                      </p>
                      {current ? (
                        <p className="flex min-h-9 items-center justify-center gap-1 rounded-md bg-accent/20 text-xs font-semibold text-primary">
                          <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                          Project Cover
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-full text-xs"
                          disabled={busy}
                          onClick={() => void choose(photo.id, 'Project cover updated')}
                        >
                          Set as Project Cover
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
