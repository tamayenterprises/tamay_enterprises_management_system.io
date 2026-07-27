import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import { useDocuments } from '@/features/data/hooks'
import { formatDate } from '@/lib/utils'
import type { DocumentCategory } from '@/types/database'
import { supabase } from '@/lib/supabase'

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
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [file, setFile] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('miscellaneous')
  const { data, isLoading, isError, refetch } = useDocuments({
    search,
    category: category === 'all' ? undefined : category,
  })

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load documents" />

  const documents = data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Documents</h1>
        <p className="text-sm text-muted-foreground">Secure storage for certifications, contracts, and company files.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload document</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <div className="space-y-1">
            <Label>File</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={uploadCategory} onValueChange={(value) => setUploadCategory(value as DocumentCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={!file || !profile?.organization_id}
              onClick={async () => {
                if (!file || !profile?.organization_id) return
                const path = `${profile.id}/${Date.now()}-${file.name}`
                const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
                if (uploadError) {
                  toast.error(uploadError.message)
                  return
                }
                const { error } = await supabase.from('documents').insert({
                  organization_id: profile.organization_id,
                  owner_id: profile.id,
                  uploaded_by: profile.id,
                  name: file.name,
                  category: uploadCategory,
                  storage_path: path,
                  mime_type: file.type,
                  file_size: file.size,
                })
                if (error) toast.error(error.message)
                else {
                  setFile(null)
                  toast.success('Document uploaded')
                  refetch()
                }
              }}
            >
              Upload
            </Button>
          </div>
        </CardContent>
      </Card>

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
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {documents.length === 0 ? (
        <EmptyState title="No documents found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-lg">{doc.name}</CardTitle>
                <Badge variant="secondary">{doc.category}</Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Uploaded {formatDate(doc.created_at)}
                {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(1)} KB` : ''}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
