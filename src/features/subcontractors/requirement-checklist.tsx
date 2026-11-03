import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { NativeSelect } from '@/components/ui/native-select'
import { viewDocumentFile } from '@/features/data/documents'
import {
  useAddCustomRequirement,
  useRemoveCustomRequirement,
  useRequirementDocuments,
  useRequirementItems,
  useReviewRequirementDocument,
  useSetRequirementRequired,
  useSubmitRequirementDocument,
} from '@/features/subcontractors/hooks'
import {
  REQUIREMENT_STATUS_LABEL,
  TRADE_LICENSE_TYPES,
  requirementAction,
  requirementStatusVariant,
  formatDay,
  submissionStatus,
} from '@/lib/subcontractor-requirements'
import { confirmAction, resolvedDocumentUploadAccept } from '@/lib/uploads'
import { formatDate } from '@/lib/utils'
import type { DocumentRecord, SubcontractorRequirementItem } from '@/types/database'

type Mode = 'self' | 'management'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/** Required From You (self) or the management review list for one subcontractor. */
export function RequirementChecklist({ profileId, mode }: { profileId: string; mode: Mode }) {
  const { data: items = [], isLoading, isError } = useRequirementItems(profileId)
  const { data: documents = [] } = useRequirementDocuments(profileId)

  if (isLoading) return <LoadingState label="Loading requirements..." />
  if (isError) return <p className="text-sm text-destructive">Could not load the requirements. Refresh and try again.</p>

  const payment = items.filter((item) => item.requirement_key === 'payment_ach')
  const counted = items.filter((item) => item.requirement_key !== 'payment_ach')
  const required = counted.filter((item) => item.required)
  const optional = counted.filter((item) => !item.required)

  return (
    <div className="space-y-4">
      <RequirementGroup title="Required" items={required} documents={documents} profileId={profileId} mode={mode} />
      {optional.length > 0 ? (
        <RequirementGroup
          title={mode === 'self' ? 'If it applies to your work' : 'Not required for this subcontractor'}
          items={optional}
          documents={documents}
          profileId={profileId}
          mode={mode}
        />
      ) : null}
      {payment.length > 0 ? (
        <RequirementGroup
          title="Payment information"
          description="Needed to pay you. Only Tamay Admin can see it. It does not affect Ready to Work."
          items={payment}
          documents={documents}
          profileId={profileId}
          mode={mode}
        />
      ) : null}
      {mode === 'management' ? <AddCustomRequirementForm profileId={profileId} /> : null}
    </div>
  )
}

function RequirementGroup({
  title,
  description,
  items,
  documents,
  profileId,
  mode,
}: {
  title: string
  description?: string
  items: SubcontractorRequirementItem[]
  documents: DocumentRecord[]
  profileId: string
  mode: Mode
}) {
  if (items.length === 0) return null
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {items.map((item) =>
        item.requirement_key === 'trade_license' ? (
          <TradeLicenseRow key="trade_license" item={item} documents={documents} profileId={profileId} mode={mode} />
        ) : (
          <RequirementRow
            key={item.requirement_id ?? item.requirement_key}
            item={item}
            documents={documents}
            profileId={profileId}
            mode={mode}
          />
        ),
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: SubcontractorRequirementItem['status'] }) {
  return <Badge variant={requirementStatusVariant(status)}>{REQUIREMENT_STATUS_LABEL[status]}</Badge>
}

function RequirementMeta({ item }: { item: SubcontractorRequirementItem }) {
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {item.submitted_at ? <p>Submitted {formatDate(item.submitted_at)}</p> : null}
      {item.expires_on ? <p>Expires {formatDay(item.expires_on)}</p> : null}
      {item.status === 'rejected' && item.review_note ? (
        <p className="font-medium text-destructive">Reason: {item.review_note}</p>
      ) : null}
    </div>
  )
}

function RequirementRow({
  item,
  documents,
  profileId,
  mode,
}: {
  item: SubcontractorRequirementItem
  documents: DocumentRecord[]
  profileId: string
  mode: Mode
}) {
  const [uploading, setUploading] = useState(false)
  const latest = documents.find((doc) => doc.id === item.document_id) ?? null
  const action = requirementAction(item.status)

  return (
    <div className="rounded-md border border-border px-3 py-2.5" data-testid={`requirement-${item.requirement_id ?? item.requirement_key}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.label}</p>
            <StatusBadge status={item.status} />
          </div>
          <RequirementMeta item={item} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest ? <ViewButton doc={latest} /> : null}
          {mode === 'self' ? (
            <Button size="sm" variant={action ? 'default' : 'outline'} onClick={() => setUploading(true)}>
              {action === 'upload' ? 'Upload' : action === 'replace' ? 'Upload Replacement' : 'Replace file'}
            </Button>
          ) : (
            <>
              {latest && latest.review_status === 'submitted' ? <ReviewButtons doc={latest} label={item.label} /> : null}
              <RequiredToggle item={item} profileId={profileId} />
              {item.requirement_key === 'other' && item.requirement_id ? (
                <RemoveCustomButton requirementId={item.requirement_id} label={item.label} />
              ) : null}
            </>
          )}
        </div>
      </div>
      {uploading ? <UploadRequirementDialog item={item} onClose={() => setUploading(false)} /> : null}
    </div>
  )
}

function TradeLicenseRow({
  item,
  documents,
  profileId,
  mode,
}: {
  item: SubcontractorRequirementItem
  documents: DocumentRecord[]
  profileId: string
  mode: Mode
}) {
  const [uploading, setUploading] = useState(false)
  const licenses = documents.filter((doc) => doc.requirement_key === 'trade_license')
  const summary =
    licenses.length === 0
      ? mode === 'self'
        ? 'Choose your license type (Electrical, Plumbing, HVAC…) and upload it.'
        : 'No license uploaded yet.'
      : `${licenses.length} license${licenses.length === 1 ? '' : 's'} uploaded · ${REQUIREMENT_STATUS_LABEL[item.status]}`

  return (
    <div className="space-y-2" data-testid="requirement-trade_license">
      <CompactAccordion
        title="Trade License"
        summary={summary}
        defaultOpen={mode === 'self' && licenses.length === 0}
        actions={
          <>
            <StatusBadge status={item.status} />
            {mode === 'management' ? <RequiredToggle item={item} profileId={profileId} /> : null}
          </>
        }
      >
        {licenses.map((doc) => {
          const status = submissionStatus(doc)
          return (
            <div key={doc.id} className="flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{doc.kind_label || 'License'}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.expires_on ? `Expires ${formatDay(doc.expires_on)}` : 'No expiration'} · {REQUIREMENT_STATUS_LABEL[status]}
                </p>
                {status === 'rejected' && doc.review_note ? (
                  <p className="text-xs font-medium text-destructive">Reason: {doc.review_note}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <ViewButton doc={doc} />
                {mode === 'management' && doc.review_status === 'submitted' ? (
                  <ReviewButtons doc={doc} label={`${doc.kind_label ?? 'Trade'} license`} />
                ) : null}
              </div>
            </div>
          )
        })}
        {mode === 'self' ? (
          <Button size="sm" onClick={() => setUploading(true)}>
            Add license
          </Button>
        ) : null}
      </CompactAccordion>
      {uploading ? <UploadRequirementDialog item={item} onClose={() => setUploading(false)} /> : null}
    </div>
  )
}

function ViewButton({ doc }: { doc: DocumentRecord }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        void viewDocumentFile(doc).catch((error: unknown) => toast.error(errorMessage(error, 'Unable to open the file')))
      }
    >
      View
    </Button>
  )
}

function ReviewButtons({ doc, label }: { doc: DocumentRecord; label: string }) {
  const review = useReviewRequirementDocument()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  async function decide(approve: boolean) {
    try {
      await review.mutateAsync({ documentId: doc.id, approve, note: approve ? null : reason })
      toast.success(approve ? `${label} approved` : `${label} rejected`)
      setRejecting(false)
      setReason('')
    } catch (error) {
      toast.error(errorMessage(error, 'Review failed'))
    }
  }

  return (
    <>
      <Button size="sm" disabled={review.isPending} onClick={() => void decide(true)}>
        Approve
      </Button>
      <Button size="sm" variant="destructive" disabled={review.isPending} onClick={() => setRejecting(true)}>
        Reject
      </Button>
      <Dialog open={rejecting} onOpenChange={(open) => !review.isPending && setRejecting(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {label}?</DialogTitle>
            <DialogDescription>The subcontractor is notified and asked to upload a replacement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor={`reject-${doc.id}`}>Reason (optional)</Label>
            <Input
              id={`reject-${doc.id}`}
              value={reason}
              maxLength={300}
              placeholder="Updated certificate required"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={review.isPending} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={review.isPending} onClick={() => void decide(false)}>
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RequiredToggle({ item, profileId }: { item: SubcontractorRequirementItem; profileId: string }) {
  const setRequired = useSetRequirementRequired()
  if (item.requirement_key === 'payment_ach') return null
  return (
    <label className="flex min-h-9 items-center gap-2 text-xs font-medium">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={item.required}
        disabled={setRequired.isPending}
        onChange={(event) => {
          const required = event.target.checked
          setRequired
            .mutateAsync({ profileId, item, required })
            .then(() => toast.success(required ? `${item.label} is now required` : `${item.label} is no longer required`))
            .catch((error: unknown) => toast.error(errorMessage(error, 'Could not update the requirement')))
        }}
      />
      Required for this subcontractor
    </label>
  )
}

function RemoveCustomButton({ requirementId, label }: { requirementId: string; label: string }) {
  const remove = useRemoveCustomRequirement()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={remove.isPending}
      onClick={() => {
        if (!confirmAction(`Remove the "${label}" requirement? Files already uploaded are kept.`)) return
        remove
          .mutateAsync(requirementId)
          .then(() => toast.success('Requirement removed'))
          .catch((error: unknown) => toast.error(errorMessage(error, 'Could not remove the requirement')))
      }}
    >
      Remove
    </Button>
  )
}

export function UploadRequirementDialog({
  item,
  onClose,
}: {
  item: SubcontractorRequirementItem
  onClose: () => void
}) {
  const submit = useSubmitRequirementDocument()
  const [file, setFile] = useState<File | null>(null)
  const [expiresOn, setExpiresOn] = useState('')
  const [licenseType, setLicenseType] = useState('')
  const isLicense = item.requirement_key === 'trade_license'
  const showExpiration = item.needs_expiration || item.expiration_optional

  async function onSubmit() {
    if (!file) return toast.error('Choose a file to upload.')
    if (isLicense && !licenseType) return toast.error('Choose the license type.')
    if (item.needs_expiration && !expiresOn) return toast.error('Enter the expiration date.')
    try {
      await submit.mutateAsync({
        requirementKey: item.requirement_key,
        requirementId: item.requirement_id,
        file,
        expiresOn: expiresOn || null,
        licenseType: isLicense ? licenseType : null,
      })
      toast.success(`${isLicense ? `${licenseType} license` : item.label} submitted for review`)
      onClose()
    } catch (error) {
      toast.error(errorMessage(error, 'Upload failed'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submit.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload {isLicense ? 'Trade License' : item.label}</DialogTitle>
          <DialogDescription>Tamay reviews it and lets you know if anything is missing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isLicense ? (
            <div className="space-y-1">
              <Label htmlFor="license-type">License type</Label>
              <NativeSelect id="license-type" value={licenseType} onChange={(event) => setLicenseType(event.target.value)}>
                <option value="">Choose license type</option>
                {TRADE_LICENSE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <FilePickerButton
              accept={resolvedDocumentUploadAccept()}
              label={file ? 'Change file' : 'Choose file'}
              size="sm"
              variant="outline"
              multiple={false}
              onFile={(selected) => setFile(selected)}
            />
            <p className="text-sm text-muted-foreground">{file ? file.name : 'PDF or photo, max 100 MB'}</p>
          </div>
          {showExpiration ? (
            <div className="space-y-1">
              <Label htmlFor="requirement-expires">
                Expiration date{item.needs_expiration ? '' : ' (optional)'}
              </Label>
              <Input id="requirement-expires" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={submit.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={submit.isPending} onClick={() => void onSubmit()}>
              {submit.isPending ? 'Uploading…' : 'Submit for review'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddCustomRequirementForm({ profileId }: { profileId: string }) {
  const add = useAddCustomRequirement()
  const [label, setLabel] = useState('')
  const [required, setRequired] = useState(true)
  const [needsExpiration, setNeedsExpiration] = useState(false)

  return (
    <section className="space-y-2 rounded-md border border-dashed border-border px-3 py-3">
      <h3 className="text-sm font-semibold">Request another document</h3>
      <div className="space-y-1">
        <Label htmlFor="custom-requirement">Document name</Label>
        <Input
          id="custom-requirement"
          value={label}
          maxLength={120}
          placeholder="Equipment insurance, reference letter…"
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={required} onChange={(event) => setRequired(event.target.checked)} />
          Required for Ready to Work
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={needsExpiration}
            onChange={(event) => setNeedsExpiration(event.target.checked)}
          />
          Has an expiration date
        </label>
      </div>
      <Button
        size="sm"
        disabled={add.isPending || !label.trim()}
        onClick={() =>
          add
            .mutateAsync({ profileId, label, required, needsExpiration })
            .then(() => {
              toast.success(`${label.trim()} requested`)
              setLabel('')
            })
            .catch((error: unknown) => toast.error(errorMessage(error, 'Could not add the document')))
        }
      >
        Add requirement
      </Button>
    </section>
  )
}
