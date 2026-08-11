import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { UPLOAD_ACCEPT, resolveUploadCategory } from '@/lib/uploads'
import type { DocumentCategory } from '@/types/database'

const CLIENT_CATEGORIES: DocumentCategory[] = ['work_photo', 'project_file', 'contract', 'miscellaneous']

export function ClientDocumentsPage() {
  const { profile } = useAuth()
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const { data: documents = [], isLoading, isError } = useDocuments({ mineOnly: false })
  const uploadDocument = useUploadDocument()
  const postPhotosToThread = usePostProjectPhotosToThread()
  const postDocumentsToThread = usePostProjectDocumentsToThread()

  const [category, setCategory] = useState<DocumentCategory>('project_file')
  const [projectId, setProjectId] = useState<string>('none')
  const [files, setFiles] = useState<File[]>([])

  const clientDocs = useMemo(() => {
    const mine = documents.filter(
      (doc) => doc.owner_id === profile?.id || doc.uploaded_by === profile?.id || Boolean(doc.project_id),
    )
    // Prefer docs on assigned projects or owned by the client
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
      for (const file of files) {
        uploaded.push(
          await uploadDocument.mutateAsync({
            file,
            category: resolveUploadCategory(file, category) as DocumentCategory,
            projectId: linkedProjectId,
            bucket,
          }),
        )
      }

      if (linkedProjectId) {
        const threadPhotos = uploaded.filter(
          (doc) => doc.category === 'work_photo' || Boolean(doc.mime_type?.startsWith('image/')),
        )
        const threadDocs = uploaded.filter(
          (doc) => doc.category !== 'work_photo' && !doc.mime_type?.startsWith('image/'),
        )
        if (threadPhotos.length > 0) {
          await postPhotosToThread.mutateAsync({
            projectId: linkedProjectId,
            photos: threadPhotos,
            visibleToClient: true,
          })
        }
        if (threadDocs.length > 0) {
          await postDocumentsToThread.mutateAsync({
            projectId: linkedProjectId,
            documents: threadDocs,
            visibleToClient: true,
          })
        }
      }

      toast.success(
        files.length === 1 ? 'File uploaded and saved' : `${files.length} files uploaded and saved`,
      )
      setFiles([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

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
            Upload photos or documents (PDF, Word, Excel). Files linked to a project are saved there
            and noted in the project message thread.
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
                  {CLIENT_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {documentCategoryLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Personal file (no project)</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Files</Label>
              <FilePickerButton
                accept={UPLOAD_ACCEPT}
                variant="outline"
                multiple
                selectedFiles={files}
                onFiles={setFiles}
              />
            </div>
          </div>
          <SelectedFilesList files={files} onChange={setFiles} />
          <p className="text-xs text-muted-foreground">
            PDFs and photos are supported. Select several at once, or keep adding more before you
            upload.
          </p>
          <Button
            disabled={
              files.length === 0 ||
              uploadDocument.isPending ||
              postPhotosToThread.isPending ||
              postDocumentsToThread.isPending
            }
            onClick={() => void onUpload()}
          >
            {uploadDocument.isPending ||
            postPhotosToThread.isPending ||
            postDocumentsToThread.isPending
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
