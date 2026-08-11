import { Link, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClientProjectUpdates } from '@/features/client/project-updates'
import {
  createDocumentSignedUrl,
  useDocuments,
  usePostProjectPhotosToThread,
  useProject,
  useUploadDocument,
} from '@/features/data/hooks'
import { documentCategoryLabel, formatFileSize, projectStatusLabel } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT, UPLOAD_ACCEPT, confirmAction } from '@/lib/uploads'
import type { DocumentCategory } from '@/types/database'

export function ClientProjectDetailPage() {
  const { projectId } = useParams()
  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: documents = [] } = useDocuments({ projectId })
  const uploadDocument = useUploadDocument()
  const postPhotosToThread = usePostProjectPhotosToThread()
  const [category, setCategory] = useState<DocumentCategory>('work_photo')
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
      for (const file of files) {
        uploaded.push(
          await uploadDocument.mutateAsync({
            file,
            category,
            projectId,
            bucket: 'project-files',
          }),
        )
      }

      const threadPhotos = uploaded.filter(
        (doc) => doc.category === 'work_photo' || Boolean(doc.mime_type?.startsWith('image/')),
      )
      if (threadPhotos.length > 0) {
        await postPhotosToThread.mutateAsync({
          projectId,
          photos: threadPhotos,
          visibleToClient: true,
        })
      }

      toast.success(
        threadPhotos.length > 0
          ? files.length === 1
            ? 'Photo shared in project messages'
            : `${files.length} files uploaded and shared in project messages`
          : files.length === 1
            ? 'Document uploaded'
            : `${files.length} files uploaded`,
      )
      setFiles([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

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
            Photos are saved to this project and posted in the message thread so you and Tamay can
            review them together. Documents stay in the files list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_photo">Space / work photo</SelectItem>
                  <SelectItem value="project_file">Project document</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="miscellaneous">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Files</Label>
              <div className="flex flex-wrap items-center gap-2">
                <FilePickerButton
                  accept={category === 'work_photo' ? IMAGE_UPLOAD_ACCEPT : UPLOAD_ACCEPT}
                  variant="outline"
                  multiple
                  selectedFiles={files}
                  onFiles={setFiles}
                />
                <p className="text-xs text-muted-foreground">
                  Select several at once, or keep adding more before you upload.
                </p>
              </div>
              <SelectedFilesList files={files} onChange={setFiles} />
            </div>
          </div>
          <Button
            disabled={files.length === 0 || uploadDocument.isPending || postPhotosToThread.isPending}
            onClick={() => void onUpload()}
          >
            {uploadDocument.isPending || postPhotosToThread.isPending
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
