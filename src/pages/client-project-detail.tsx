import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, HelpCircle, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { LoadingState } from '@/components/ui/loading-state'
import { ClientProjectHero } from '@/features/client/project-hero'
import { ClientProjectPayments } from '@/features/client/project-payments'
import { ClientProjectSummaryCards } from '@/features/client/project-summary-cards'
import { ClientProjectUpdates } from '@/features/client/project-updates'
import {
  createDocumentSignedUrl,
  useDocuments,
  usePostProjectDocumentsToThread,
  usePostProjectPhotosToThread,
  useProject,
  useProjectNotes,
  useUploadDocument,
} from '@/features/data/hooks'
import { useProjectPayments } from '@/features/projects/finance-hooks'
import { formatUnknownError } from '@/lib/auth-errors'
import { paymentProgressPercent } from '@/lib/client-portal-progress'
import {
  activeStripePayLink,
  remainingBalance,
  sumValidPayments,
} from '@/lib/project-finance'
import { documentCategoryLabel, formatDate, formatFileSize } from '@/lib/utils'
import { UPLOAD_ACCEPT, categoryForUploadFile, confirmAction } from '@/lib/uploads'
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

export function ClientProjectDetailPage() {
  const { projectId } = useParams()
  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: documents = [] } = useDocuments({ projectId })
  const { data: notes = [] } = useProjectNotes(projectId)
  const { data: payments = [] } = useProjectPayments(projectId, { clientSafe: true })
  const uploadDocument = useUploadDocument()
  const postPhotosToThread = usePostProjectPhotosToThread()
  const postDocumentsToThread = usePostProjectDocumentsToThread()
  const [files, setFiles] = useState<File[]>([])
  const [photosOpen, setPhotosOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)

  const photos = useMemo(
    () => documents.filter((doc) => doc.category === 'work_photo'),
    [documents],
  )
  const fileDocs = useMemo(
    () => documents.filter((doc) => doc.category !== 'work_photo'),
    [documents],
  )

  const totalPaid = useMemo(() => sumValidPayments(payments), [payments])
  const balance = remainingBalance(project?.current_project_total, totalPaid)
  const payLink = activeStripePayLink(payments)
  const payPct = paymentProgressPercent(project?.current_project_total, totalPaid)
  const latestUpdate = useMemo(() => {
    const roots = notes.filter((n) => !n.parent_id)
    if (roots.length === 0) return null
    return [...roots].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]
  }, [notes])

  const attentionLabel = payLink
    ? 'A payment is ready when you are'
    : project?.status === 'waiting'
      ? 'Tamay may be waiting on a decision or material'
      : 'No action needed'

  if (isLoading) return <LoadingState label="Loading project..." />
  if (isError || !project) {
    return (
      <EmptyState
        title="Project not found"
        description="This project may not be assigned to your account yet."
      />
    )
  }

  const onUpload = async () => {
    if (files.length === 0 || !projectId) return
    try {
      const uploaded = []
      for (const file of files) {
        uploaded.push(
          await uploadDocument.mutateAsync({
            file,
            category: categoryForUploadFile(file),
            projectId,
            bucket: 'project-files',
          }),
        )
      }

      const threadPhotos = uploaded.filter(
        (doc) => doc.category === 'work_photo' || Boolean(doc.mime_type?.startsWith('image/')),
      )
      const threadDocs = uploaded.filter(
        (doc) => doc.category !== 'work_photo' && !doc.mime_type?.startsWith('image/'),
      )

      if (threadPhotos.length > 0) {
        await postPhotosToThread.mutateAsync({
          projectId,
          photos: threadPhotos,
          visibleToClient: true,
        })
      }
      if (threadDocs.length > 0) {
        await postDocumentsToThread.mutateAsync({
          projectId,
          documents: threadDocs,
          visibleToClient: true,
        })
      }

      toast.success(
        files.length === 1 ? 'File uploaded and saved' : `${files.length} files uploaded and saved`,
      )
      setFiles([])
    } catch (error) {
      toast.error(formatUnknownError(error, 'Upload failed'))
    }
  }

  const uploading =
    uploadDocument.isPending || postPhotosToThread.isPending || postDocumentsToThread.isPending

  const mediaAndHelp = (
    <>
      <div className="rounded-2xl border border-border/80 bg-white p-3 shadow-[0_1px_2px_rgba(9,46,76,0.04)] sm:p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Share with Tamay
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            accept={UPLOAD_ACCEPT}
            variant="outline"
            multiple
            selectedFiles={files}
            onFiles={setFiles}
          />
          <Button
            disabled={files.length === 0 || uploading}
            className="rounded-lg"
            onClick={() => void onUpload()}
          >
            {uploading
              ? 'Uploading…'
              : files.length > 1
                ? `Upload ${files.length}`
                : 'Upload'}
          </Button>
        </div>
        <SelectedFilesList files={files} onChange={setFiles} />
        <p className="mt-2 text-xs text-muted-foreground">
          Photos and documents only. Receipts are handled by the Tamay team.
        </p>
      </div>

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
        open={photosOpen}
        onOpenChange={(open) => {
          setPhotosOpen(open)
          if (open) setDocsOpen(false)
        }}
        className="rounded-2xl border-border/80 bg-white shadow-[0_1px_2px_rgba(9,46,76,0.04)]"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {photos.map((doc) => (
            <PhotoThumb key={doc.id} doc={doc} />
          ))}
        </div>
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
        open={docsOpen}
        onOpenChange={(open) => {
          setDocsOpen(open)
          if (open) setPhotosOpen(false)
        }}
        className="rounded-2xl border-border/80 bg-white shadow-[0_1px_2px_rgba(9,46,76,0.04)]"
      >
        {fileDocs.map((doc) => (
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
      </CompactAccordion>

      <section className="rounded-2xl border border-border/80 bg-gradient-to-br from-primary to-[#092e4c] p-4 text-white shadow-[0_8px_24px_rgba(9,46,76,0.18)]">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <HelpCircle className="h-4 w-4 text-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold">Need help?</p>
            <p className="mt-0.5 text-sm text-white/80">We&apos;re here for you.</p>
            <Button
              asChild
              className="mt-3 h-10 w-full rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
            >
              <a href="#client-ask-question">Ask a question</a>
            </Button>
          </div>
        </div>
      </section>
    </>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <ClientProjectHero
        project={project}
        paymentPercent={project.current_project_total != null ? payPct : null}
      />

      {/* Desktop summary row */}
      <div className="hidden lg:block">
        <ClientProjectSummaryCards
          project={project}
          totalPaid={totalPaid}
          remaining={balance}
          latestUpdate={latestUpdate}
          attentionLabel={attentionLabel}
          payLink={payLink}
        />
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
        {/*
          Mobile: display:contents so order puts Payments → Summary → Updates → Media.
          Desktop: sticky right column stacks Payments + Media beside Updates.
        */}
        <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-3 lg:self-start lg:sticky lg:top-20">
          <div className="order-1">
            <ClientProjectPayments project={project} />
          </div>
          <div className="order-4 space-y-3">{mediaAndHelp}</div>
        </div>

        <div className="order-2 lg:hidden">
          <ClientProjectSummaryCards
            project={project}
            totalPaid={totalPaid}
            remaining={balance}
            latestUpdate={latestUpdate}
            attentionLabel={attentionLabel}
            payLink={payLink}
          />
        </div>

        <div className="order-3 lg:col-start-1 lg:row-start-1">
          <ClientProjectUpdates projectId={project.id} />
        </div>
      </div>
    </div>
  )
}
