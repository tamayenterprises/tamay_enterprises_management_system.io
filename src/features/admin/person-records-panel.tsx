import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  createCertificationProofUrl,
  useCertifications,
  useDeleteCertification,
  useDeleteDocument,
  useDocuments,
  viewDocumentFile,
} from '@/features/data/hooks'
import { canRemoveDocument, canViewerSeeDocument } from '@/lib/document-visibility'
import { confirmAction } from '@/lib/uploads'
import {
  certificationStatusLabel,
  documentCategoryLabel,
  formatDate,
  isManagementRole,
} from '@/lib/utils'

export function PersonRecordsPanel({
  profileId,
  personLabel,
}: {
  profileId: string
  personLabel: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <CompactAccordion
      title="Documents & certifications"
      summary={`Files ${personLabel} uploaded, plus certifications on this account.`}
      expandLabel="View files"
      collapseLabel="Hide files"
      open={open}
      onOpenChange={setOpen}
    >
      {open ? <PersonRecordsLists profileId={profileId} /> : null}
    </CompactAccordion>
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
    () => docs.filter((doc) => canViewerSeeDocument(doc, profile)),
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
                          await deleteCertification.mutateAsync(cert)
                          toast.success('Certification removed')
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
                      {documentCategoryLabel(doc.category)}
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
