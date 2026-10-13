import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { LoadingState } from '@/components/ui/loading-state'
import { ClientProjectHero } from '@/features/client/project-hero'
import { ClientProjectMediaLists } from '@/features/client/project-media-lists'
import { ClientProjectPayments } from '@/features/client/project-payments'
import { ClientProjectSummaryCards } from '@/features/client/project-summary-cards'
import { ClientProjectUpdates } from '@/features/client/project-updates'
import {
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
import {
  categoryForUploadFile,
  isUploadSizeLimitMessage,
  partitionUploadFiles,
  resolvedDocumentUploadAccept,
  resolvedImageUploadAccept,
  uploadFolderHint,
} from '@/lib/uploads'

/** Compact mobile support card — links to existing #client-ask-question composer. */
function MobileAskQuestionCard() {
  return (
    <section className="rounded-2xl border border-border/80 bg-gradient-to-br from-primary to-[#092e4c] p-4 text-white shadow-[0_8px_24px_rgba(9,46,76,0.18)] lg:hidden">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
          <HelpCircle className="h-4 w-4 text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold tracking-tight">
            Have a question or concern?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-white/80">
            We&apos;re here to help. Send us a message anytime.
          </p>
          <Button
            asChild
            className="mt-3 h-11 w-full rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <a href="#client-ask-question">Ask a Question</a>
          </Button>
        </div>
      </div>
    </section>
  )
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
      const failures: string[] = []
      for (const file of files) {
        try {
          uploaded.push(
            await uploadDocument.mutateAsync({
              file,
              category: categoryForUploadFile(file),
              projectId,
              bucket: 'project-files',
            }),
          )
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `Failed: ${file.name}`)
        }
      }

      const threadPhotos = uploaded.filter(
        (doc) => doc.category === 'work_photo' || Boolean(doc.mime_type?.startsWith('image/')),
      )
      const threadDocs = uploaded.filter(
        (doc) => doc.category !== 'work_photo' && !doc.mime_type?.startsWith('image/'),
      )

      const threadErrors: string[] = []
      if (threadPhotos.length > 0) {
        try {
          await postPhotosToThread.mutateAsync({
            projectId,
            photos: threadPhotos,
          })
        } catch (error) {
          threadErrors.push(error instanceof Error ? error.message : 'Photo thread update failed')
        }
      }
      if (threadDocs.length > 0) {
        try {
          await postDocumentsToThread.mutateAsync({
            projectId,
            documentCount: threadDocs.length,
          })
        } catch (error) {
          threadErrors.push(
            error instanceof Error ? error.message : 'Document thread update failed',
          )
        }
      }

      if (failures.length > 0) {
        const message =
          uploaded.length > 0
            ? `${uploaded.length} uploaded; ${failures.length} failed. ${failures[0]}`
            : failures[0]!
        toast.error(message, {
          duration: isUploadSizeLimitMessage(message) ? 10_000 : 6_000,
        })
      } else if (threadErrors.length > 0) {
        toast.warning(
          uploaded.length === 1
            ? `File saved, but thread update failed: ${threadErrors[0]}`
            : `${uploaded.length} files saved, but thread update failed: ${threadErrors[0]}`,
        )
      } else {
        toast.success(
          uploaded.length === 1
            ? 'File uploaded and saved'
            : `${uploaded.length} files uploaded and saved`,
        )
      }
      if (uploaded.length > 0) setFiles([])
    } catch (error) {
      toast.error(formatUnknownError(error, 'Upload failed'))
    }
  }

  const uploading =
    uploadDocument.isPending || postPhotosToThread.isPending || postDocumentsToThread.isPending

  const mediaColumn = (
    <>
      <div className="rounded-2xl border border-border/80 bg-white p-3 shadow-[0_1px_2px_rgba(9,46,76,0.04)] sm:p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Share with Tamay
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            accept={resolvedImageUploadAccept()}
            label="Add photos"
            variant="outline"
            multiple
            selectedFiles={files}
            onFiles={(selected) => {
              const { accepted, errors } = partitionUploadFiles(selected)
              if (errors.length > 0) {
                const message =
                  errors.length === 1
                    ? errors[0]!
                    : `${errors[0]} (+${errors.length - 1} more)`
                toast.error(message, {
                  duration: isUploadSizeLimitMessage(message) ? 10_000 : 6_000,
                })
              }
              if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted])
            }}
          />
          <FilePickerButton
            accept={resolvedDocumentUploadAccept()}
            label="Add documents"
            variant="outline"
            multiple
            selectedFiles={files}
            onFiles={(selected) => {
              const { accepted, errors } = partitionUploadFiles(selected)
              if (errors.length > 0) {
                const message =
                  errors.length === 1
                    ? errors[0]!
                    : `${errors[0]} (+${errors.length - 1} more)`
                toast.error(message, {
                  duration: isUploadSizeLimitMessage(message) ? 10_000 : 6_000,
                })
              }
              if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted])
            }}
          />
          <FilePickerButton
            variant="outline"
            directory
            selectedFiles={files}
            onFiles={(selected) => {
              const { accepted, errors } = partitionUploadFiles(selected)
              if (errors.length > 0) {
                const message =
                  errors.length === 1
                    ? errors[0]!
                    : `${errors[0]} (+${errors.length - 1} more)`
                toast.error(message, {
                  duration: isUploadSizeLimitMessage(message) ? 10_000 : 6_000,
                })
              }
              if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted])
            }}
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
        <p className="text-xs text-muted-foreground">{uploadFolderHint()}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Photos and documents only. Receipts are handled by the Tamay team.
        </p>
      </div>

      <ClientProjectMediaLists photos={photos} fileDocs={fileDocs} />

      {/* Desktop-only help card — mobile uses MobileAskQuestionCard after Payment Summary */}
      <section className="hidden rounded-2xl border border-border/80 bg-gradient-to-br from-primary to-[#092e4c] p-4 text-white shadow-[0_8px_24px_rgba(9,46,76,0.18)] lg:block">
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

      {/* Desktop/tablet summary row — hidden on mobile to avoid duplicating Hero + Payment Summary */}
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
          Mobile (display:contents): Payments → Ask → Updates → Media
          Desktop: sticky right column stacks Payments + Media beside Updates.
        */}
        <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-3 lg:self-start lg:sticky lg:top-20">
          <div className="order-1">
            <ClientProjectPayments project={project} />
          </div>
          <div className="order-2 lg:hidden">
            <MobileAskQuestionCard />
          </div>
          <div className="order-4 space-y-3">{mediaColumn}</div>
        </div>

        <div className="order-3 lg:col-start-1 lg:row-start-1">
          <ClientProjectUpdates projectId={project.id} />
        </div>
      </div>
    </div>
  )
}
