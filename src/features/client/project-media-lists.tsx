import { useEffect, useState } from 'react'
import { FileText, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { SeeMoreButton } from '@/components/ui/see-more-button'
import { createDocumentSignedUrl } from '@/features/data/hooks'
import { formatUnknownError } from '@/lib/auth-errors'
import { useListPreview } from '@/lib/list-preview'
import { confirmAction } from '@/lib/uploads'
import { documentCategoryLabel, formatDate, formatFileSize } from '@/lib/utils'
import type { DocumentRecord } from '@/types/database'

function PhotoThumb({ doc }: { doc: DocumentRecord }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createDocumentSignedUrl(doc)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [doc])

  return (
    <button
      type="button"
      aria-label={doc.name}
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/70 bg-muted/40 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={async () => {
        try {
          const openUrl = url ?? (await createDocumentSignedUrl(doc))
          window.open(openUrl, '_blank', 'noopener,noreferrer')
        } catch (error) {
          toast.error(formatUnknownError(error, 'Unable to open file'))
        }
      }}
    >
      {url ? (
        <img
          src={url}
          alt={doc.name}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          loading="lazy"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-muted-foreground">
          <ImageIcon className="h-6 w-6" />
        </span>
      )}
    </button>
  )
}

function fileTypeLabel(doc: DocumentRecord) {
  if (doc.mime_type?.includes('pdf')) return 'PDF'
  if (doc.mime_type?.startsWith('image/')) return 'Image'
  if (doc.mime_type?.includes('word') || doc.name.endsWith('.docx')) return 'DOCX'
  const ext = doc.name.split('.').pop()
  return ext ? ext.toUpperCase() : 'File'
}

const CLIENT_MEDIA_PREVIEW = 2
const CLIENT_MEDIA_STEP = 3

export function ClientProjectMediaLists({
  photos,
  fileDocs,
}: {
  photos: DocumentRecord[]
  fileDocs: DocumentRecord[]
}) {
  const photoList = useListPreview(photos, photos.length, CLIENT_MEDIA_STEP, CLIENT_MEDIA_PREVIEW)
  const docList = useListPreview(fileDocs, fileDocs.length, CLIENT_MEDIA_STEP, CLIENT_MEDIA_PREVIEW)

  return (
    <>
      <CompactAccordion
        title="PHOTOS"
        summary={
          photos.length === 0
            ? 'No project photos yet'
            : `${photos.length} project photo${photos.length === 1 ? '' : 's'}`
        }
        empty={photos.length === 0}
        expandLabel="View Photos ▼"
        collapseLabel="Hide Photos ▲"
        defaultOpen
        className="rounded-2xl border-border/80 bg-white shadow-[0_1px_2px_rgba(9,46,76,0.04)]"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {photoList.visible.map((doc) => (
            <PhotoThumb key={doc.id} doc={doc} />
          ))}
        </div>
        <SeeMoreButton
          shown={photoList.shown}
          total={photoList.total}
          step={CLIENT_MEDIA_STEP}
          onMore={photoList.showMore}
        />
      </CompactAccordion>

      <CompactAccordion
        title="DOCUMENTS"
        summary={
          fileDocs.length === 0
            ? 'No project documents yet'
            : `${fileDocs.length} project document${fileDocs.length === 1 ? '' : 's'}`
        }
        empty={fileDocs.length === 0}
        expandLabel="View Documents ▼"
        collapseLabel="Hide Documents ▲"
        defaultOpen
        className="rounded-2xl border-border/80 bg-white shadow-[0_1px_2px_rgba(9,46,76,0.04)]"
      >
        {docList.visible.map((doc) => (
          <div
            key={doc.id}
            className="flex items-start gap-3 rounded-xl border border-border/70 bg-[#fbfcff] px-3 py-2.5"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.kind_label || documentCategoryLabel(doc.category)} · {fileTypeLabel(doc)}
                {doc.created_at ? ` · ${formatDate(doc.created_at)}` : null}
                {' · '}
                {formatFileSize(doc.file_size ?? 0)}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-8 rounded-lg"
                onClick={async () => {
                  if (!confirmAction('Open this document in a new tab?')) return
                  try {
                    const url = await createDocumentSignedUrl(doc)
                    window.open(url, '_blank', 'noopener,noreferrer')
                  } catch (error) {
                    toast.error(formatUnknownError(error, 'Unable to open file'))
                  }
                }}
              >
                Open / Download
              </Button>
            </div>
          </div>
        ))}
        <SeeMoreButton
          shown={docList.shown}
          total={docList.total}
          step={CLIENT_MEDIA_STEP}
          onMore={docList.showMore}
        />
      </CompactAccordion>
    </>
  )
}
