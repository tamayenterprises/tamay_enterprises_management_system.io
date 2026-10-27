import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { MobileListGate, SeeMoreButton } from '@/components/ui/see-more-button'
import {
  downloadDocumentFile,
  useDeleteDocument,
  usePendingDocumentDeleteRequests,
  useRequestDocumentDelete,
  useReviewDocumentDelete,
  viewDocumentFile,
} from '@/features/data/hooks'
import { DeleteRequestDialog } from '@/features/documents/delete-request-dialog'
import { DocumentTeamAccess } from '@/features/projects/document-team-access'
import {
  canRemoveDocument,
  canRequestDocumentDelete,
  canViewerSeeDocument,
  isProjectPhotoDocument,
} from '@/lib/document-visibility'
import { LIST_PREVIEW, useListPreview } from '@/lib/list-preview'
import { confirmAction } from '@/lib/uploads'
import { canAccessAdmin, documentCategoryLabel, formatRelative, isManagementRole } from '@/lib/utils'
import type { DocumentRecord, Profile } from '@/types/database'

type Props = {
  documents: DocumentRecord[]
  viewer: Pick<Profile, 'id' | 'role'> | null | undefined
  focusDocId?: string | null
}

/** Photos & documents lists on the staff Project Detail page. */
export function ProjectFilesList({ documents, viewer, focusDocId }: Props) {
  const deleteDocument = useDeleteDocument()
  const requestDelete = useRequestDocumentDelete()
  const reviewDelete = useReviewDocumentDelete()
  const { data: pendingDeleteRequests = [] } = usePendingDocumentDeleteRequests()
  const pendingByDocumentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of pendingDeleteRequests) {
      if (item.document_id) map.set(item.document_id, item.id)
    }
    return map
  }, [pendingDeleteRequests])
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const canManage = isManagementRole(viewer?.role)
  const canApproveDeletes = canAccessAdmin(viewer?.role)

  const { photos, projectDocuments } = useMemo(() => {
    const visible = documents.filter((doc) => canViewerSeeDocument(doc, viewer))
    return {
      photos: visible.filter(isProjectPhotoDocument),
      projectDocuments: visible.filter((doc) => !isProjectPhotoDocument(doc)),
    }
  }, [documents, viewer])

  const photoList = useListPreview(photos, photos.length)
  const docList = useListPreview(projectDocuments, projectDocuments.length)

  useEffect(() => {
    if (!focusDocId) return
    photoList.revealAll()
    docList.revealAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDocId])

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

  async function resolvePending(doc: DocumentRecord, approve: boolean) {
    const requestId = pendingByDocumentId.get(doc.id)
    if (!requestId) return
    if (
      !confirmAction(
        approve ? 'Approve this delete? The file will be removed.' : 'Deny this delete request? The file will stay.',
      )
    ) {
      return
    }
    await run(async () => {
      await reviewDelete.mutateAsync({ requestId, approve })
      toast.success(approve ? 'File deleted' : 'Delete request denied')
    }, 'Could not review the request')
  }

  function fileActions(doc: DocumentRecord, extras: { download?: boolean; removeDone: string }) {
    const pending = pendingByDocumentId.has(doc.id)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {pending ? <Badge variant="warning">Pending</Badge> : null}
        {canApproveDeletes && pending ? (
          <>
            <Button size="sm" onClick={() => void resolvePending(doc, true)}>
              Approve delete
            </Button>
            <Button size="sm" variant="outline" onClick={() => void resolvePending(doc, false)}>
              Deny
            </Button>
          </>
        ) : canRemoveDocument(doc, viewer) && !pending ? (
          <Button size="sm" variant="destructive" onClick={() => void remove(doc, extras.removeDone)}>
            Remove
          </Button>
        ) : canRequestDocumentDelete(doc, viewer) ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setDeleteReason('')
              setDeleteTarget(doc)
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
    )
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
        <MobileListGate enabled={photos.length > 0}>
        {photoList.visible.map((doc) => (
          <div key={doc.id} id={`doc-${doc.id}`} className={rowClass(doc)}>
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.kind_label || 'Photo'} · {formatRelative(doc.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void run(() => viewDocumentFile(doc), 'Open failed')}>
                Open
              </Button>
              {fileActions(doc, { removeDone: 'Photo removed' })}
            </div>
          </div>
        ))}
        <SeeMoreButton
          shown={photoList.shown}
          total={photoList.total}
          step={LIST_PREVIEW}
          onMore={photoList.showMore}
        />
        </MobileListGate>
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
        <MobileListGate enabled={projectDocuments.length > 0}>
        {docList.visible.map((doc) => (
          <div key={doc.id} id={`doc-${doc.id}`} className={rowClass(doc)}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.kind_label || documentCategoryLabel(doc.category)} · {formatRelative(doc.created_at)}
              </p>
              {canManage ? <DocumentTeamAccess doc={doc} /> : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:self-start">
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
              {fileActions(doc, { removeDone: 'Document removed' })}
            </div>
          </div>
        ))}
        <SeeMoreButton shown={docList.shown} total={docList.total} step={LIST_PREVIEW} onMore={docList.showMore} />
        </MobileListGate>
      </CompactAccordion>
      <DeleteRequestDialog
        open={Boolean(deleteTarget)}
        itemKind="document"
        itemName={deleteTarget?.name}
        reason={deleteReason}
        submitting={requestDelete.isPending}
        onReasonChange={setDeleteReason}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteReason('')
        }}
        onSubmit={() => {
          void (async () => {
            if (!deleteTarget) return
            const reason = deleteReason.trim()
            if (reason.length < 5) {
              toast.error('Please explain why this document should be deleted.')
              return
            }
            try {
              await requestDelete.mutateAsync({ documentId: deleteTarget.id, reason })
              toast.success('Delete request sent. Status is Pending until an admin decides.')
              setDeleteTarget(null)
              setDeleteReason('')
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not send delete request')
            }
          })()
        }}
      />
    </>
  )
}
