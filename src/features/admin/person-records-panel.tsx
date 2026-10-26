import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  createCertificationProofUrl,
  useCertifications,
  useDeleteCertification,
  useDeleteDocument,
  useDocuments,
  useUploadDocument,
  viewDocumentFile,
} from '@/features/data/hooks'
import { canRemoveDocument, canUploadPersonnelDocument, canViewerSeeDocument } from '@/lib/document-visibility'
import { confirmAction, DOCUMENT_UPLOAD_ACCEPT, IMAGE_UPLOAD_ACCEPT, partitionUploadFiles } from '@/lib/uploads'
import {
  certificationStatusLabel,
  documentCategoryLabel,
  formatDate,
  isManagementRole,
  PERSONNEL_DOCUMENT_KINDS,
} from '@/lib/utils'

export function PersonnelUploadButton({
  profileId,
  personLabel,
  onUploaded,
}: {
  profileId: string
  personLabel: string
  onUploaded?: () => void
}) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  if (!canUploadPersonnelDocument(profile)) return null
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Upload
      </Button>
      <PersonnelDocumentUploadDialog
        open={open}
        onOpenChange={setOpen}
        profileId={profileId}
        personLabel={personLabel}
        onUploaded={onUploaded}
      />
    </>
  )
}

export function PersonRecordsPanel({
  profileId,
  personLabel,
}: {
  profileId: string
  personLabel: string
}) {
  const { profile } = useAuth()
  const canUpload = canUploadPersonnelDocument(profile)
  const [open, setOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <>
      <CompactAccordion
        title="Documents & certifications"
        summary={
          canUpload
            ? `Upload W-2, W-9, licenses, insurance, and other files for ${personLabel}.`
            : `Files ${personLabel} uploaded, plus certifications on this account.`
        }
        expandLabel="View files"
        collapseLabel="Hide files"
        open={open}
        onOpenChange={setOpen}
        actions={
          canUpload ? (
            <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          ) : null
        }
      >
        {open ? <PersonRecordsLists profileId={profileId} /> : null}
      </CompactAccordion>
      {canUpload ? (
        <PersonnelDocumentUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          profileId={profileId}
          personLabel={personLabel}
          onUploaded={() => setOpen(true)}
        />
      ) : null}
    </>
  )
}

function PersonnelDocumentUploadDialog({
  open,
  onOpenChange,
  profileId,
  personLabel,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  personLabel: string
  onUploaded?: () => void
}) {
  const uploadDocument = useUploadDocument()
  const [kindLabel, setKindLabel] = useState(PERSONNEL_DOCUMENT_KINDS[0].label)
  const [file, setFile] = useState<File | null>(null)

  const kind = PERSONNEL_DOCUMENT_KINDS.find((item) => item.label === kindLabel) ?? PERSONNEL_DOCUMENT_KINDS[0]

  function stageFiles(selected: File[]) {
    const { accepted, errors } = partitionUploadFiles(selected)
    if (errors[0]) toast.error(errors[0])
    if (accepted[0]) setFile(accepted[0])
  }

  async function submit() {
    if (!file) {
      toast.error('Choose a file to upload.')
      return
    }
    try {
      await uploadDocument.mutateAsync({
        file,
        category: kind.category,
        kindLabel: kind.label,
        ownerId: profileId,
        bucket: 'documents',
      })
      toast.success(`${kind.label} uploaded for ${personLabel}`)
      setFile(null)
      onOpenChange(false)
      onUploaded?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload for {personLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="personnel-doc-type">Document type</Label>
            <NativeSelect
              id="personnel-doc-type"
              value={kind.label}
              onChange={(event) => setKindLabel(event.target.value)}
            >
              {PERSONNEL_DOCUMENT_KINDS.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <FilePickerButton
            label={file ? 'Replace file' : 'Choose file'}
            accept={`${DOCUMENT_UPLOAD_ACCEPT},${IMAGE_UPLOAD_ACCEPT}`}
            multiple={false}
            onFiles={stageFiles}
          />
          {file ? <SelectedFilesList files={[file]} onChange={(files) => setFile(files[0] ?? null)} /> : null}
          <Button type="button" disabled={uploadDocument.isPending} onClick={() => void submit()}>
            {uploadDocument.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PersonRecordsLists({ profileId }: { profileId: string }) {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const deleteDocument = useDeleteDocument()
  const deleteCertification = useDeleteCertification()
  const { data: certs = [], isLoading: certsLoading, isError: certsError } = useCertifications({
    profileId,
  })
  const { data: docs = [], isLoading: docsLoading, isError: docsError } = useDocuments({
    personId: profileId,
  })

  const visibleDocs = useMemo(
    () =>
      docs.filter(
        (doc) => doc.category !== 'certification' && canViewerSeeDocument(doc, profile),
      ),
    [docs, profile],
  )

  if (certsLoading || docsLoading) {
    return <p className="text-xs text-muted-foreground">Loading files…</p>
  }
  if (certsError || docsError) {
    return <p className="text-xs text-destructive">Unable to load this person’s files.</p>
  }

  return (
    <div className="space-y-3">
      <section className="space-y-1.5">
        <p className="text-xs font-medium">Certifications ({certs.length})</p>
        {certs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No certifications on this account.</p>
        ) : (
          <ul className="space-y-2">
            {certs.map((cert) => (
              <li key={cert.id} className="rounded-md border border-border px-2.5 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{cert.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cert.certification_type} · expires {formatDate(cert.expiration_date)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      cert.status === 'valid'
                        ? 'success'
                        : cert.status === 'expiring_soon'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {certificationStatusLabel(cert.status)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cert.document_url ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const url = await createCertificationProofUrl(cert.document_url)
                          window.open(url, '_blank', 'noopener,noreferrer')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Unable to open proof file')
                        }
                      }}
                    >
                      View proof
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">No proof file</p>
                  )}
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deleteCertification.isPending}
                      onClick={async () => {
                        if (!confirmAction(`Remove certification "${cert.name}"? This cannot be undone.`)) return
                        try {
                          const { fileWarning } = await deleteCertification.mutateAsync(cert)
                          toast.success('Certification removed')
                          if (fileWarning) toast.warning(fileWarning)
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Remove failed')
                        }
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-xs font-medium">Documents ({visibleDocs.length})</p>
        {visibleDocs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No documents owned or uploaded by this person.</p>
        ) : (
          <ul className="space-y-2">
            {visibleDocs.map((doc) => (
              <li key={doc.id} className="rounded-md border border-border px-2.5 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.kind_label || documentCategoryLabel(doc.category)}
                      {doc.project?.name ? ` · ${doc.project.name}` : ''}
                      {' · '}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await viewDocumentFile(doc)
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Open failed')
                      }
                    }}
                  >
                    Open
                  </Button>
                  {canRemoveDocument(doc, profile) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deleteDocument.isPending}
                      onClick={async () => {
                        if (!confirmAction(`Remove "${doc.name}"? This cannot be undone.`)) return
                        try {
                          await deleteDocument.mutateAsync(doc)
                          toast.success('Document removed')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Remove failed')
                        }
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
