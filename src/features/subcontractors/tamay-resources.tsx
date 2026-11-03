import { useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteDocument, downloadDocumentFile, viewDocumentFile } from '@/features/data/documents'
import { useFilesFromTamay, useSharedResources, useUploadSharedResource } from '@/features/subcontractors/hooks'
import { confirmAction, resolvedDocumentUploadAccept } from '@/lib/uploads'
import { formatDate } from '@/lib/utils'
import type { DocumentRecord } from '@/types/database'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/**
 * Uploaded by Tamay: resources shared with every subcontractor (blank W-9, agreement, safety rules)
 * plus files Tamay put on this subcontractor's own record.
 */
export function TamayResourcesList({ profileId }: { profileId: string }) {
  const { data: shared = [], isLoading: sharedLoading } = useSharedResources()
  const { data: personal = [], isLoading: personalLoading } = useFilesFromTamay(profileId)
  const files = [...shared, ...personal]

  if (sharedLoading || personalLoading) return <p className="text-sm text-muted-foreground">Loading files…</p>
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">Tamay has not shared any forms yet.</p>
  }
  return (
    <ul className="space-y-2">
      {files.map((doc) => (
        <ResourceRow key={doc.id} doc={doc} />
      ))}
    </ul>
  )
}

function ResourceRow({ doc, onRemove }: { doc: DocumentRecord; onRemove?: () => void }) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          <p className="text-xs text-muted-foreground">Added {formatDate(doc.created_at)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void viewDocumentFile(doc).catch((error: unknown) => toast.error(errorMessage(error, 'Unable to open the file')))}
        >
          View
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void downloadDocumentFile(doc).catch((error: unknown) => toast.error(errorMessage(error, 'Download failed')))}
        >
          Download
        </Button>
        {onRemove ? (
          <Button size="sm" variant="destructive" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/** Management: publish forms and guides every subcontractor sees under Uploaded by Tamay. */
export function SharedResourcesManager() {
  const { data: shared = [] } = useSharedResources()
  const upload = useUploadSharedResource()
  const remove = useDeleteDocument()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="resource-title">File name shown to subcontractors</Label>
          <Input
            id="resource-title"
            value={title}
            maxLength={120}
            placeholder="Blank W-9, Subcontractor Agreement, Safety Rules…"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <FilePickerButton
          accept={resolvedDocumentUploadAccept()}
          label={file ? file.name : 'Choose file'}
          size="sm"
          variant="outline"
          multiple={false}
          onFile={(selected) => setFile(selected)}
        />
        <Button
          size="sm"
          disabled={!file || upload.isPending}
          onClick={() => {
            if (!file) return
            upload
              .mutateAsync({ file, title: title || file.name })
              .then(() => {
                toast.success('Shared with subcontractors')
                setFile(null)
                setTitle('')
              })
              .catch((error: unknown) => toast.error(errorMessage(error, 'Upload failed')))
          }}
        >
          {upload.isPending ? 'Uploading…' : 'Share with subcontractors'}
        </Button>
      </div>
      {shared.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
      ) : (
        <ul className="space-y-2">
          {shared.map((doc) => (
            <ResourceRow
              key={doc.id}
              doc={doc}
              onRemove={() => {
                if (!confirmAction(`Stop sharing "${doc.name}" with subcontractors?`)) return
                remove
                  .mutateAsync(doc)
                  .then(() => toast.success('Removed'))
                  .catch((error: unknown) => toast.error(errorMessage(error, 'Remove failed')))
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
