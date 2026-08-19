import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { NativeSelect } from '@/components/ui/native-select'
import { useAuth } from '@/features/auth/auth-context'
import {
  createDocumentSignedUrl,
  useDocuments,
  usePostProjectDocumentsToThread,
  usePostProjectPhotosToThread,
  useProjects,
  useUploadDocument,
} from '@/features/data/hooks'
import { documentCategoryLabel, formatFileSize, formatRelative } from '@/lib/utils'
import {
  categoryForUploadFile,
  isUploadSizeLimitMessage,
  partitionUploadFiles,
  resolvedDocumentUploadAccept,
  resolvedImageUploadAccept,
  uploadFolderHint,
} from '@/lib/uploads'

export function ClientDocumentsPage() {
  const { profile } = useAuth()
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const { data: documents = [], isLoading, isError } = useDocuments({ mineOnly: false })
  const uploadDocument = useUploadDocument()
  const postPhotosToThread = usePostProjectPhotosToThread()
  const postDocumentsToThread = usePostProjectDocumentsToThread()

  const [projectId, setProjectId] = useState<string>('none')
  const [files, setFiles] = useState<File[]>([])

  const clientDocs = useMemo(() => {
    const mine = documents.filter(
      (doc) => doc.owner_id === profile?.id || doc.uploaded_by === profile?.id || Boolean(doc.project_id),
    )
    const assignedIds = new Set(projects.map((p) => p.id))
    return mine.filter(
      (doc) =>
        doc.owner_id === profile?.id ||
        doc.uploaded_by === profile?.id ||
        (doc.project_id != null && assignedIds.has(doc.project_id)),
    )
  }, [documents, profile?.id, projects])

  if (isLoading) return <LoadingState label="Loading documents..." />
  if (isError) return <EmptyState title="Unable to load documents" />

  const onUpload = async () => {
    if (files.length === 0) return
    try {
      const bucket = projectId === 'none' ? 'documents' : 'project-files'
      const linkedProjectId = projectId === 'none' ? null : projectId
      const uploaded = []
      const failures: string[] = []
      for (const file of files) {
        try {
          uploaded.push(
            await uploadDocument.mutateAsync({
              file,
              category: categoryForUploadFile(file),
              projectId: linkedProjectId,
              bucket,
            }),
          )
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `Failed: ${file.name}`)
        }
      }

      if (linkedProjectId) {
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
              projectId: linkedProjectId,
              photos: threadPhotos,
            })
          } catch (error) {
            threadErrors.push(error instanceof Error ? error.message : 'Photo thread update failed')
          }
        }
        if (threadDocs.length > 0) {
          try {
            await postDocumentsToThread.mutateAsync({
              projectId: linkedProjectId,
              documents: threadDocs,
            })
          } catch (error) {
            threadErrors.push(
              error instanceof Error ? error.message : 'Document thread update failed',
            )
          }
        }
        if (failures.length === 0 && threadErrors.length > 0) {
          toast.warning(
            uploaded.length === 1
              ? `File saved, but thread update failed: ${threadErrors[0]}`
              : `${uploaded.length} files saved, but thread update failed: ${threadErrors[0]}`,
          )
          if (uploaded.length > 0) setFiles([])
          return
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
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Documents & photos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save files for Tamay — contracts, plans, and pictures of your space.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            Add photos and documents separately (better on phones). Optionally link them to a
            project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="client-upload-project">Project (optional)</Label>
              <NativeSelect
                id="client-upload-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="none">Personal file (no project)</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label>Files</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                    if (accepted.length > 0) setFiles(accepted)
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
                    if (accepted.length > 0) setFiles(accepted)
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
                    if (accepted.length > 0) setFiles(accepted)
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{uploadFolderHint()}</p>
            </div>
          </div>
          <SelectedFilesList files={files} onChange={setFiles} />
          <Button disabled={files.length === 0 || uploading} onClick={() => void onUpload()}>
            {uploading
              ? 'Uploading…'
              : files.length > 1
                ? `Upload ${files.length} files`
                : 'Upload'}
          </Button>
        </CardContent>
      </Card>

      {clientDocs.length === 0 ? (
        <EmptyState title="No documents yet" description="Upload a photo or file to get started." />
      ) : (
        <div className="space-y-2">
          {clientDocs.map((doc) => {
            const projectName = projects.find((p) => p.id === doc.project_id)?.name
            return (
              <button
                key={doc.id}
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5 text-left transition hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                onClick={async () => {
                  try {
                    const url = await createDocumentSignedUrl(doc)
                    window.open(url, '_blank', 'noopener,noreferrer')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Unable to open file')
                  }
                }}
              >
                <span>
                  <span className="block text-sm font-medium">{doc.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {documentCategoryLabel(doc.category)}
                    {projectName ? ` · ${projectName}` : ' · Personal'}
                    {' · '}
                    {formatFileSize(doc.file_size ?? 0)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{formatRelative(doc.created_at)}</span>
              </button>
            )
          })}
        </div>
      )}

      {projects.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          You can also upload from a project page:{' '}
          <Link className="text-primary underline" to="/portal/projects">
            My projects
          </Link>
          .
        </p>
      ) : null}
    </div>
  )
}
