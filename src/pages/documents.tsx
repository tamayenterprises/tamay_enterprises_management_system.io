import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import {
  createDocumentSignedUrl,
  useDeleteDocument,
  useDocuments,
  useProjects,
  useUploadDocument,
} from '@/features/data/hooks'
import {
  documentCategoryLabel,
  formatDate,
  formatFileSize,
  fullName,
  isManagementRole,
} from '@/lib/utils'
import { UPLOAD_ACCEPT, confirmAction } from '@/lib/uploads'
import type { DocumentCategory, DocumentRecord } from '@/types/database'

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

export function DocumentsPage() {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [scope, setScope] = useState<string>(canManage ? 'all' : 'all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('miscellaneous')
  const [uploadProjectId, setUploadProjectId] = useState<string>('none')

  const { data: projects = [] } = useProjects({ assignedOnly: !canManage })
  const { data, isLoading, isError } = useDocuments({
    search,
    category: category === 'all' ? undefined : category,
    projectId: projectFilter === 'all' || projectFilter === 'none' ? undefined : projectFilter,
    mineOnly: scope === 'mine',
  })
  const uploadDocument = useUploadDocument()
  const deleteDocument = useDeleteDocument()

  const documents = useMemo(() => {
    const rows = data ?? []
    if (projectFilter === 'none') return rows.filter((doc) => !doc.project_id)
    return rows
  }, [data, projectFilter])

  const counts = useMemo(() => {
    const rows = data ?? []
    return {
      total: rows.length,
      company: rows.filter((doc) => !doc.project_id).length,
      project: rows.filter((doc) => Boolean(doc.project_id)).length,
      mine: rows.filter((doc) => doc.owner_id === profile?.id || doc.uploaded_by === profile?.id).length,
    }
  }, [data, profile?.id])

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load documents" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Secure storage for certifications, contracts, insurance, and project files.'
              : 'Upload and access your personal documents and files shared through assigned projects.'}
          </p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>Upload document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload document</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>File</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <FilePickerButton
                    accept={UPLOAD_ACCEPT}
                    label={file ? 'Change file' : 'Choose file'}
                    size="sm"
                    variant="outline"
                    onFile={(selected) => setFile(selected)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {file ? file.name : 'No file selected yet'}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={uploadCategory}
                  onValueChange={(value) => setUploadCategory(value as DocumentCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {documentCategoryLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Link to project (optional)</Label>
                <Select value={uploadProjectId} onValueChange={setUploadProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!file || uploadDocument.isPending}
                onClick={async () => {
                  if (!file) return
                  try {
                    const projectId = uploadProjectId === 'none' ? null : uploadProjectId
                    await uploadDocument.mutateAsync({
                      file,
                      category: uploadCategory,
                      projectId,
                      bucket: projectId ? 'project-files' : 'documents',
                    })
                    toast.success('Document uploaded')
                    setFile(null)
                    setUploadCategory('miscellaneous')
                    setUploadProjectId('none')
                    setUploadOpen(false)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Upload failed')
                  }
                }}
              >
                {uploadDocument.isPending ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total files" value={counts.total} />
        <SummaryCard label="Company / personal" value={counts.company} />
        <SummaryCard label="Project-linked" value={counts.project} />
        <SummaryCard label="Uploaded by you" value={counts.mine} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {documentCategoryLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="none">Not linked to a project</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visible</SelectItem>
            <SelectItem value="mine">Uploaded by me</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents found"
          description="Upload certifications, contracts, insurance, or project files to get started."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              canDelete={canManage || doc.uploaded_by === profile?.id || doc.owner_id === profile?.id}
              onDownload={async () => {
                try {
                  const url = await createDocumentSignedUrl(doc)
                  window.open(url, '_blank', 'noopener,noreferrer')
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
            />
          ))}
        </div>
      )}
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
  canDelete,
  onDownload,
  onDelete,
}: {
  doc: DocumentRecord
  canDelete: boolean
  onDownload: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">{doc.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {doc.project ? doc.project.name : 'Company / personal'}
            {doc.uploader
              ? ` · ${fullName(doc.uploader.first_name, doc.uploader.last_name)}`
              : ''}
          </p>
        </div>
        <Badge variant="secondary">{documentCategoryLabel(doc.category)}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Uploaded {formatDate(doc.created_at)} · {formatFileSize(doc.file_size)}
          {doc.mime_type ? ` · ${doc.mime_type}` : ''}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onDownload}>
            Download
          </Button>
          {canDelete ? (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Remove
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
