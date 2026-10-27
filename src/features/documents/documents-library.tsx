import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SeeMoreButton } from '@/components/ui/see-more-button'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { clearNativeFilePickerFlag } from '@/components/ui/file-picker-helpers'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  downloadDocumentFile,
  useDeleteDocument,
  useDocuments,
  usePendingDocumentDeleteRequests,
  useProjects,
  useRequestDocumentDelete,
  useUploadDocument,
  viewDocumentFile,
} from '@/features/data/hooks'
import {
  canRemoveDocument,
  canRequestDocumentDelete,
  canViewerSeeDocument,
  isCompanyUploadedDocument,
  isSelfUploadedDocument,
} from '@/lib/document-visibility'
import { useListPreview } from '@/lib/list-preview'
import {
  documentCategoryBadgeVariant,
  documentCategoryLabel,
  formatDate,
  formatFileSize,
  fullName,
  isManagementRole,
} from '@/lib/utils'
import {
  categoryForUploadFile,
  confirmAction,
  isMobileUploadDevice,
  isUploadSizeLimitMessage,
  partitionUploadFiles,
  resolvedDocumentUploadAccept,
  resolvedImageUploadAccept,
  uploadSizeHint,
} from '@/lib/uploads'
import type { DocumentCategory, DocumentRecord } from '@/types/database'

const DOCUMENTS_PREVIEW = 2
const DOCUMENTS_STEP = 3

const CATEGORIES: DocumentCategory[] = [
  'certification',
  'license',
  'insurance',
  'contract',
  'identification',
  'work_photo',
  'project_file',
  'company',
  'miscellaneous',
]

export function DocumentsLibrary({
  variant = 'work',
  uploader = 'anyone',
  compact = false,
}: {
  variant?: 'work' | 'personal'
  uploader?: 'anyone' | 'self' | 'company'
  compact?: boolean
}) {
  const personal = variant === 'personal'
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | DocumentCategory>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [scope, setScope] = useState<string>('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploadProjectId, setUploadProjectId] = useState<string>('none')
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const projectSelectId = personal ? 'personal-upload-project' : 'upload-project'

  const { data: projects = [] } = useProjects({ assignedOnly: !canManage })
  const { data, isLoading, isError, isFetching } = useDocuments({
    search,
    category: category === 'all' ? undefined : category,
    projectId: personal
      ? undefined
      : projectFilter === 'all' || projectFilter === 'none'
        ? undefined
        : projectFilter,
    mineOnly: scope === 'mine',
    library: personal ? 'personal' : 'work',
  })
  const uploadDocument = useUploadDocument()
  const deleteDocument = useDeleteDocument()
  const requestDelete = useRequestDocumentDelete()
  const { data: pendingDeleteRequests = [] } = usePendingDocumentDeleteRequests()
  const pendingDeleteIds = useMemo(
    () => new Set(pendingDeleteRequests.flatMap((item) => (item.document_id ? [item.document_id] : []))),
    [pendingDeleteRequests],
  )

  const authorizedRows = useMemo(() => {
    const rows = (data ?? []).filter((doc) => canViewerSeeDocument(doc, profile))
    if (uploader === 'company') return rows.filter((doc) => isCompanyUploadedDocument(doc, profile?.id))
    if (uploader === 'self') return rows.filter((doc) => isSelfUploadedDocument(doc, profile?.id))
    return rows
  }, [data, profile, uploader])

  const documents = authorizedRows
  const list = useListPreview(
    documents,
    `${search}:${category}:${projectFilter}:${scope}:${variant}`,
    DOCUMENTS_STEP,
    DOCUMENTS_PREVIEW,
  )

  const counts = useMemo(() => {
    const rows = authorizedRows
    return {
      total: rows.length,
      mine: rows.filter((doc) => doc.owner_id === profile?.id || doc.uploaded_by === profile?.id).length,
    }
  }, [authorizedRows, profile?.id])

  if (isLoading && !data) return compact ? null : <LoadingState />
  if (isError && !data) {
    if (compact) return null
    return <EmptyState title={personal ? 'Unable to load personal documents' : 'Unable to load work documents'} />
  }
  if (compact && documents.length === 0) return null

  const mobileUpload = isMobileUploadDevice()
  const title = personal ? 'Personal Documents' : 'Work Documents'
  const uploadLabel = personal ? 'Upload Signed Documents' : 'Upload work document'

  const stageFiles = (selected: File[]) => {
    const { accepted, errors } = partitionUploadFiles(selected)
    if (errors.length > 0) {
      const message =
        errors.length === 1 ? errors[0]! : `${errors[0]} (+${errors.length - 1} more)`
      toast.error(message, {
        duration: isUploadSizeLimitMessage(message) ? 10_000 : 6_000,
      })
    }
    if (accepted.length > 0) setFiles(accepted)
  }

  const runUpload = async () => {
    if (files.length === 0) return
    if (!personal && uploadProjectId === 'none') {
      toast.error('Choose a project for work documents.')
      return
    }
    try {
      const projectId = personal ? null : uploadProjectId
      const failures: string[] = []
      let uploadedCount = 0
      for (const file of files) {
        try {
          await uploadDocument.mutateAsync({
            file,
            category: personal ? 'miscellaneous' : categoryForUploadFile(file),
            projectId,
            bucket: projectId ? 'project-files' : 'documents',
          })
          uploadedCount += 1
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `Failed: ${file.name}`)
        }
      }
      if (failures.length > 0) {
        const message =
          uploadedCount > 0
            ? `${uploadedCount} uploaded; ${failures.length} failed. ${failures[0]}`
            : failures[0]!
        toast.error(message, {
          duration: isUploadSizeLimitMessage(message) ? 10_000 : 6_000,
        })
      } else {
        toast.success(
          uploadedCount === 1
            ? personal
              ? 'Personal document uploaded'
              : 'Work document uploaded'
            : `${uploadedCount} documents uploaded`,
        )
      }
      if (uploadedCount > 0) {
        setFiles([])
        setUploadProjectId('none')
        setUploadOpen(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  const uploadForm = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Files</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <FilePickerButton
            accept={resolvedImageUploadAccept()}
            label="Add photos"
            size="sm"
            variant="outline"
            multiple
            selectedFiles={files}
            onFiles={stageFiles}
          />
          <FilePickerButton
            accept={resolvedDocumentUploadAccept()}
            label="Add documents"
            size="sm"
            variant="outline"
            multiple
            selectedFiles={files}
            onFiles={stageFiles}
          />
        </div>
        <p className="text-xs text-muted-foreground">{uploadSizeHint()}</p>
        <SelectedFilesList files={files} onChange={setFiles} />
      </div>
      {personal ? null : (
        <div className="space-y-1">
          <Label htmlFor={projectSelectId}>Project</Label>
          <NativeSelect
            id={projectSelectId}
            value={uploadProjectId}
            onChange={(event) => setUploadProjectId(event.target.value)}
          >
            <option value="none">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <Button
        disabled={files.length === 0 || uploadDocument.isPending}
        onClick={() => void runUpload()}
      >
        {uploadDocument.isPending
          ? 'Uploading…'
          : files.length > 1
            ? `Upload ${files.length} files`
            : 'Upload'}
      </Button>
    </div>
  )

  const fileCards =
    documents.length === 0 ? null : (
      <div className="space-y-3">
        <div
          className={`grid gap-4 lg:grid-cols-2 ${isFetching ? 'opacity-70 transition-opacity' : ''}`}
        >
          {list.visible.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              personal={personal}
              canDelete={canRemoveDocument(doc, profile)}
              canRequestDelete={canRequestDocumentDelete(doc, profile)}
              deletePending={pendingDeleteIds.has(doc.id)}
              onView={async () => {
                try {
                  await viewDocumentFile(doc)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Open failed')
                }
              }}
              onDownload={async () => {
                try {
                  await downloadDocumentFile(doc)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Download failed')
                }
              }}
              onDelete={async () => {
                if (!confirmAction(`Remove "${doc.name}"? This cannot be undone.`)) return
                try {
                  await deleteDocument.mutateAsync(doc)
                  toast.success('Document removed')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Remove failed')
                }
              }}
              onRequestDelete={() => {
                setDeleteReason('')
                setDeleteTarget(doc)
              }}
            />
          ))}
        </div>
        <SeeMoreButton
          shown={list.shown}
          total={list.total}
          step={DOCUMENTS_STEP}
          onMore={list.showMore}
        />
      </div>
    )

  const deleteRequestDialog = (
    <Dialog
      open={Boolean(deleteTarget)}
      onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null)
          setDeleteReason('')
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request document delete</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Admin will review this before anything is removed
          {deleteTarget ? ` (${deleteTarget.name}).` : '.'}
        </p>
        <div className="space-y-2">
          <Label htmlFor="document-delete-reason">Why do you want to delete this document?</Label>
          <Textarea
            id="document-delete-reason"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="Give a short reason for the admin."
            rows={4}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDeleteTarget(null)
              setDeleteReason('')
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={requestDelete.isPending}
            onClick={async () => {
              if (!deleteTarget) return
              const reason = deleteReason.trim()
              if (reason.length < 5) {
                toast.error('Please explain why this document should be deleted.')
                return
              }
              try {
                await requestDelete.mutateAsync({ documentId: deleteTarget.id, reason })
                toast.success('Delete request sent to admin')
                setDeleteTarget(null)
                setDeleteReason('')
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not send delete request')
              }
            }}
          >
            {requestDelete.isPending ? 'Sending…' : 'Send request'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  if (compact) {
    return (
      <>
        {fileCards}
        {deleteRequestDialog}
      </>
    )
  }

  const headingClass = personal
    ? 'font-display text-2xl font-semibold'
    : 'font-display text-3xl font-semibold'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {personal ? (
            <h2 className={headingClass}>{title}</h2>
          ) : (
            <h1 className={headingClass}>{title}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {personal
              ? 'Files you uploaded yourself — W-2s, licenses, and other personal paperwork.'
              : canManage
                ? 'Project files, photos, and paperwork tied to jobs.'
                : 'Files shared through the jobs you are assigned to.'}
          </p>
        </div>
        {mobileUpload ? null : (
          <Dialog
            open={uploadOpen}
            onOpenChange={(open) => {
              if (!open) clearNativeFilePickerFlag()
              setUploadOpen(open)
            }}
          >
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">{uploadLabel}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{uploadLabel}</DialogTitle>
              </DialogHeader>
              {uploadForm}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {mobileUpload ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
          </CardHeader>
          <CardContent>{uploadForm}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Total files" value={counts.total} />
        <SummaryCard label="Uploaded by you" value={counts.mine} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Input className="w-full min-w-0 sm:w-64" placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <NativeSelect
          className="w-full sm:w-52"
          value={category}
          onChange={(event) => setCategory(event.target.value as 'all' | DocumentCategory)}
          aria-label="Category"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {documentCategoryLabel(item)}
            </option>
          ))}
        </NativeSelect>
        {personal ? null : (
          <NativeSelect
            className="w-full sm:w-52"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            aria-label="Project"
          >
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect
          className="w-full sm:w-44"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          aria-label="Scope"
        >
          <option value="all">All visible</option>
          <option value="mine">Uploaded by me</option>
        </NativeSelect>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title={personal ? 'No personal documents yet' : 'No work documents found'}
          description={
            personal
              ? 'Upload signed files you added yourself. Files Tamay uploaded appear under Uploaded by Tamay.'
              : 'Upload files onto a project to see them here.'
          }
        />
      ) : (
        fileCards
      )}
      {deleteRequestDialog}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function DocumentCard({
  doc,
  personal,
  canDelete,
  canRequestDelete,
  deletePending,
  onView,
  onDownload,
  onDelete,
  onRequestDelete,
}: {
  doc: DocumentRecord
  personal: boolean
  canDelete: boolean
  canRequestDelete: boolean
  deletePending: boolean
  onView: () => Promise<void>
  onDownload: () => Promise<void>
  onDelete: () => Promise<void>
  onRequestDelete: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">{doc.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {personal ? 'Personal' : doc.project ? doc.project.name : 'Work'}
            {doc.uploader
              ? ` · ${fullName(doc.uploader.first_name, doc.uploader.last_name)}`
              : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={documentCategoryBadgeVariant(doc.category)}>
            {documentCategoryLabel(doc.category)}
          </Badge>
          {deletePending ? <Badge variant="outline">Delete pending</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Uploaded {formatDate(doc.created_at)} · {formatFileSize(doc.file_size)}
          {doc.mime_type ? ` · ${doc.mime_type}` : ''}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onView}>
            View
          </Button>
          <Button size="sm" variant="outline" onClick={onDownload}>
            Download
          </Button>
          {canDelete ? (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Remove
            </Button>
          ) : canRequestDelete ? (
            <Button size="sm" variant="destructive" disabled={deletePending} onClick={onRequestDelete}>
              Delete
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
