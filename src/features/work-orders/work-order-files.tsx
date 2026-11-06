import { useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  openWorkOrderFile,
  useRemoveWorkOrderFile,
  useReviewWorkOrderDocument,
  useSubmitWorkOrderDocument,
  useUploadWorkOrderReferences,
  useWorkOrderFiles,
  useWorkOrderPhotoUrls,
} from '@/features/work-orders/hooks'
import { confirmAction, resolvedDocumentUploadAccept } from '@/lib/uploads'
import { formatDate } from '@/lib/utils'
import {
  DOCUMENT_CATEGORY_LABEL,
  SUBCONTRACTOR_DOCUMENT_TYPES,
  TAMAY_DOCUMENT_TYPES,
  insuranceStatus,
  sortTamayDocuments,
} from '@/lib/work-orders'
import type { WorkOrderDocumentCategory, WorkOrderFileRecord, WorkOrderRecord } from '@/types/database'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

function openFile(file: WorkOrderFileRecord) {
  void openWorkOrderFile(file).catch((error: unknown) => toast.error(errorMessage(error, 'Unable to open the file')))
}

function TypeSelect({
  id,
  value,
  types,
  onChange,
}: {
  id: string
  value: WorkOrderDocumentCategory
  types: WorkOrderDocumentCategory[]
  onChange: (value: WorkOrderDocumentCategory) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Document type</Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value as WorkOrderDocumentCategory)}>
        {types.map((type) => (
          <option key={type} value={type}>
            {DOCUMENT_CATEGORY_LABEL[type]}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

function FileRow({ file, children }: { file: WorkOrderFileRecord; children?: React.ReactNode }) {
  return (
    <li className="space-y-2 rounded-md border border-border px-3 py-2" data-testid="work-order-file">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {file.category ? DOCUMENT_CATEGORY_LABEL[file.category] : 'File'} · {formatDate(file.created_at)}
            </span>
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openFile(file)}>
            Open
          </Button>
          {children}
        </div>
      </div>
    </li>
  )
}

/** Tamay photos show as thumbnails; other documents as rows. */
function isPhoto(file: WorkOrderFileRecord) {
  return file.category === 'photo' || Boolean(file.mime_type?.startsWith('image/') && file.category !== 'plans')
}

function RemoveButton({ file, compact = false }: { file: WorkOrderFileRecord; compact?: boolean }) {
  const remove = useRemoveWorkOrderFile()
  return (
    <Button
      size="sm"
      variant={compact ? 'ghost' : 'destructive'}
      className={compact ? 'h-7 w-full text-xs text-destructive' : undefined}
      disabled={remove.isPending}
      onClick={() => {
        if (!confirmAction(`Remove "${file.name}" from this work order?`)) return
        remove
          .mutateAsync(file)
          .then(() => toast.success('File removed'))
          .catch((error: unknown) => toast.error(errorMessage(error, 'Remove failed')))
      }}
    >
      Remove
    </Button>
  )
}

/** Contract, proposal, plans, photos and other files from Tamay. Offered subcontractors can read them before accepting. */
export function TamayDocuments({ workOrder, canManage }: { workOrder: WorkOrderRecord; canManage: boolean }) {
  const { data: files = [], isLoading } = useWorkOrderFiles(workOrder.id)
  const upload = useUploadWorkOrderReferences()
  const [category, setCategory] = useState<WorkOrderDocumentCategory>('contract')
  const references = files.filter((file) => file.kind === 'reference')
  const photos = references.filter(isPhoto)
  const documents = sortTamayDocuments(references.filter((file) => !isPhoto(file)))
  const { data: urls } = useWorkOrderPhotoUrls(photos.map((photo) => photo.storage_path))

  return (
    <div className="space-y-3">
      {photos.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Job site photos ({photos.length})</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="work-order-site-photos">
            {photos.map((photo) => {
              const url = urls?.get(photo.storage_path)
              return (
                <li key={photo.id} className="space-y-1">
                  <button
                    type="button"
                    className="block aspect-square w-full overflow-hidden rounded-md border border-border bg-muted"
                    aria-label={`Open ${photo.name}`}
                    onClick={() => openFile(photo)}
                  >
                    {url ? <img src={url} alt={photo.name} className="h-full w-full object-cover" loading="lazy" /> : null}
                  </button>
                  {canManage ? <RemoveButton file={photo} compact /> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : documents.length === 0 ? (
        photos.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> : null
      ) : (
        <ul className="space-y-2">
          {documents.map((file) => (
            <FileRow key={file.id} file={file}>
              {canManage ? <RemoveButton file={file} /> : null}
            </FileRow>
          ))}
        </ul>
      )}
      {canManage && workOrder.status !== 'closed' ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <TypeSelect id="wo-tamay-doc-type" value={category} types={TAMAY_DOCUMENT_TYPES} onChange={setCategory} />
          </div>
          <FilePickerButton
            accept={resolvedDocumentUploadAccept()}
            label="Upload"
            size="sm"
            multiple
            isLoading={upload.isPending}
            onFiles={async (selected) => {
              try {
                await upload.mutateAsync({ workOrder, files: selected, category })
                toast.success(selected.length === 1 ? 'Document added' : `${selected.length} documents added`)
              } catch (error) {
                toast.error(errorMessage(error, 'Upload failed'))
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

const REVIEW_BADGE: Record<NonNullable<WorkOrderFileRecord['review_status']>, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  submitted: { label: 'Waiting for Tamay review', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

function ReviewControls({ file }: { file: WorkOrderFileRecord }) {
  const review = useReviewWorkOrderDocument()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  async function submit(approve: boolean) {
    try {
      await review.mutateAsync({ file, approve, note: approve ? null : note })
      toast.success(approve ? 'Insurance certificate approved' : 'Insurance certificate rejected')
      setRejecting(false)
      setNote('')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the review'))
    }
  }

  if (rejecting) {
    return (
      <div className="w-full space-y-2">
        <Label htmlFor={`reject-${file.id}`}>Reason (sent to the subcontractor)</Label>
        <Textarea
          id={`reject-${file.id}`}
          rows={2}
          maxLength={500}
          placeholder="Client must be listed as Certificate Holder"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" disabled={review.isPending} onClick={() => void submit(false)}>
            Reject certificate
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }
  return (
    <>
      <Button size="sm" disabled={review.isPending} onClick={() => void submit(true)}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => setRejecting(true)}>
        Reject
      </Button>
    </>
  )
}

const INSURANCE_MESSAGE = {
  missing: { text: 'Not uploaded yet', variant: 'destructive' as const },
  submitted: { text: 'Waiting for Tamay review', variant: 'warning' as const },
  rejected: { text: 'Rejected — upload a new certificate', variant: 'destructive' as const },
  approved: { text: 'Approved', variant: 'success' as const },
}

/**
 * Documents the subcontractor adds to this work order: insurance certificate (Tamay approves it),
 * permits, receipts / invoices and others. Only management and the assigned subcontractor see them.
 */
export function SubcontractorDocuments({
  workOrder,
  canManage,
  canUpload,
}: {
  workOrder: WorkOrderRecord
  canManage: boolean
  canUpload: boolean
}) {
  const { data: files = [], isLoading } = useWorkOrderFiles(workOrder.id)
  const submit = useSubmitWorkOrderDocument()
  const [category, setCategory] = useState<WorkOrderDocumentCategory>(workOrder.insurance_required ? 'insurance' : 'receipt')
  const documents = files
    .filter((file) => file.kind === 'subcontractor_document')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const insurance = insuranceStatus(workOrder, files)

  return (
    <div className="space-y-3">
      {workOrder.insurance_required ? (
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="insurance-requirement">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Insurance certificate required
            {insurance !== 'not_required' ? (
              <Badge variant={INSURANCE_MESSAGE[insurance].variant}>{INSURANCE_MESSAGE[insurance].text}</Badge>
            ) : null}
          </p>
          <p>
            General Liability certificate for this job, listing as <strong>Certificate Holder</strong>:
          </p>
          <p className="whitespace-pre-line rounded bg-background px-2 py-1 font-medium">{workOrder.certificate_holder}</p>
          <p className="text-xs text-muted-foreground">Work cannot start until Tamay approves it.</p>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents from the subcontractor yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((file) => (
            <FileRow key={file.id} file={file}>
              {file.review_status ? (
                <Badge variant={REVIEW_BADGE[file.review_status].variant}>{REVIEW_BADGE[file.review_status].label}</Badge>
              ) : null}
              {canManage && file.category === 'insurance' && file.review_status === 'submitted' ? <ReviewControls file={file} /> : null}
              {canManage ? <RemoveButton file={file} /> : null}
              {file.review_status === 'rejected' && file.review_note ? (
                <p className="w-full text-xs text-destructive">Reason: {file.review_note}</p>
              ) : null}
            </FileRow>
          ))}
        </ul>
      )}

      {canUpload && workOrder.status !== 'closed' ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <TypeSelect id="wo-sub-doc-type" value={category} types={SUBCONTRACTOR_DOCUMENT_TYPES} onChange={setCategory} />
          </div>
          <FilePickerButton
            accept={resolvedDocumentUploadAccept()}
            label="Upload"
            size="sm"
            multiple
            isLoading={submit.isPending}
            onFiles={async (selected) => {
              try {
                await submit.mutateAsync({ workOrderId: workOrder.id, files: selected, category })
                toast.success(category === 'insurance' ? 'Certificate sent to Tamay for review' : 'Document added')
              } catch (error) {
                toast.error(errorMessage(error, 'Upload failed'))
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
