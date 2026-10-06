import { useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { downloadDocumentFile, useDeleteDocument, viewDocumentFile } from '@/features/data/hooks'
import { DocumentTeamAccess } from '@/features/projects/document-team-access'
import {
  canRemoveDocument,
  canViewerSeeDocument,
  isProjectPhotoDocument,
} from '@/lib/document-visibility'
import { confirmAction } from '@/lib/uploads'
import { documentCategoryLabel, formatRelative, isManagementRole } from '@/lib/utils'
import type { DocumentRecord, Profile } from '@/types/database'

type Props = {
  documents: DocumentRecord[]
  viewer: Pick<Profile, 'id' | 'role'> | null | undefined
  focusDocId?: string | null
}

/** Photos & documents lists on the staff Project Detail page. */
export function ProjectFilesList({ documents, viewer, focusDocId }: Props) {
  const deleteDocument = useDeleteDocument()
  const canManage = isManagementRole(viewer?.role)

  const { photos, projectDocuments } = useMemo(() => {
    const visible = documents.filter((doc) => canViewerSeeDocument(doc, viewer))
    return {
      photos: visible.filter(isProjectPhotoDocument),
      projectDocuments: visible.filter((doc) => !isProjectPhotoDocument(doc)),
    }
  }, [documents, viewer])

  async function run(action: () => Promise<void>, fallback: string) {
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback)
    }
  }

  async function remove(doc: DocumentRecord, done: string) {
    if (!confirmAction(`Remove "${doc.name}"? This cannot be undone.`)) return
    await run(async () => {
      await deleteDocument.mutateAsync(doc)
      toast.success(done)
    }, 'Remove failed')
  }

  const rowClass = (doc: DocumentRecord) =>
    `flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
      focusDocId === doc.id ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border'
    }`

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
        defaultOpen={Boolean(focusDocId && photos.some((d) => d.id === focusDocId))}
      >
        {photos.map((doc) => (
          <div key={doc.id} id={`doc-${doc.id}`} className={rowClass(doc)}>
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.kind_label || 'Photo'} · {formatRelative(doc.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void run(() => viewDocumentFile(doc), 'Open failed')}>
                Open
              </Button>
              {canRemoveDocument(doc, viewer) ? (
                <Button size="sm" variant="destructive" onClick={() => void remove(doc, 'Photo removed')}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CompactAccordion>

      <CompactAccordion
        title="DOCUMENTS"
        summary={
          projectDocuments.length === 0
            ? 'No project documents yet'
            : `${projectDocuments.length} project document${projectDocuments.length === 1 ? '' : 's'}`
        }
        empty={projectDocuments.length === 0}
        expandLabel="View Documents ▼"
        collapseLabel="Hide Documents ▲"
        defaultOpen={Boolean(focusDocId && projectDocuments.some((d) => d.id === focusDocId))}
      >
        {projectDocuments.map((doc) => (
          <div key={doc.id} id={`doc-${doc.id}`} className={rowClass(doc)}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.kind_label || documentCategoryLabel(doc.category)} · {formatRelative(doc.created_at)}
              </p>
              {canManage ? <DocumentTeamAccess doc={doc} /> : null}
            </div>
            <div className="flex gap-2 sm:self-start">
              <Button size="sm" variant="outline" onClick={() => void run(() => viewDocumentFile(doc), 'Open failed')}>
                View
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void run(() => downloadDocumentFile(doc), 'Download failed')}
              >
                Download
              </Button>
              {canRemoveDocument(doc, viewer) ? (
                <Button size="sm" variant="destructive" onClick={() => void remove(doc, 'Document removed')}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CompactAccordion>
    </>
  )
}
