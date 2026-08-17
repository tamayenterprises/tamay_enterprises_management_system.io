import { Link, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { LoadingState } from '@/components/ui/loading-state'
import { ClientProjectUpdates } from '@/features/client/project-updates'
import {
  createDocumentSignedUrl,
  useDocuments,
  usePostProjectDocumentsToThread,
  usePostProjectPhotosToThread,
  useProject,
  useUploadDocument,
} from '@/features/data/hooks'
import { documentCategoryLabel, formatDate, formatFileSize, projectStatusLabel } from '@/lib/utils'
import {
  IMAGE_UPLOAD_ACCEPT,
  categoryForUploadFile,
  confirmAction,
  isUploadSizeLimitMessage,
  partitionUploadFiles,
  resolvedDocumentUploadAccept,
  uploadFolderHint,
} from '@/lib/uploads'

export function ClientProjectDetailPage() {
  const { projectId } = useParams()
  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: documents = [] } = useDocuments({ projectId })
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
            documents: threadDocs,
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
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  const uploading =
    uploadDocument.isPending || postPhotosToThread.isPending || postDocumentsToThread.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/portal/projects">← Back to projects</Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.location || 'No location'} · {projectStatusLabel(project.status)}
          </p>
          {project.warranty_ends_on ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Warranty through {formatDate(project.warranty_ends_on)}
            </p>
          ) : null}
        </div>
      </div>

      {project.description ? (
        <Card>
          <CardHeader>
            <CardTitle>About this project</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {project.description}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Share files & space photos</CardTitle>
          <CardDescription>
            Add photos and documents separately (better on phones). Everything is saved to this
            project and noted in the message thread for you and Tamay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <FilePickerButton
              accept={IMAGE_UPLOAD_ACCEPT}
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
                setFiles(accepted)
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
                setFiles(accepted)
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
                setFiles(accepted)
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{uploadFolderHint()}</p>
          <SelectedFilesList files={files} onChange={setFiles} />
          <Button disabled={files.length === 0 || uploading} onClick={() => void onUpload()}>
            {uploading
              ? 'Uploading…'
              : files.length > 1
                ? `Upload ${files.length} files`
                : 'Upload'}
          </Button>

          <div className="grid gap-4 pt-2 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Photos</p>
              {photos.length === 0 ? (
                <p className="text-xs text-muted-foreground">No photos yet.</p>
              ) : (
                photos.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={async () => {
                      try {
                        const url = await createDocumentSignedUrl(doc)
                        window.open(url, '_blank', 'noopener,noreferrer')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Unable to open file')
                      }
                    }}
                  >
                    {doc.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatFileSize(doc.file_size ?? 0)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Documents</p>
              {fileDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No documents yet.</p>
              ) : (
                fileDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={async () => {
                      if (!confirmAction('Open this document in a new tab?')) return
                      try {
                        const url = await createDocumentSignedUrl(doc)
                        window.open(url, '_blank', 'noopener,noreferrer')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Unable to open file')
                      }
                    }}
                  >
                    {doc.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {documentCategoryLabel(doc.category)} · {formatFileSize(doc.file_size ?? 0)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ClientProjectUpdates projectId={project.id} />
    </div>
  )
}
