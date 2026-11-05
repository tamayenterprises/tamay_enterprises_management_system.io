import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import {
  openWorkOrderFile,
  useRemoveWorkOrderFile,
  useUploadWorkOrderReferences,
  useWorkOrderFiles,
} from '@/features/work-orders/hooks'
import { confirmAction, resolvedDocumentUploadAccept } from '@/lib/uploads'
import type { WorkOrderRecord } from '@/types/database'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/** Reference photos / drawings / PDFs attached by Tamay. Management can add and remove. */
export function WorkOrderReferenceFiles({ workOrder, canManage }: { workOrder: WorkOrderRecord; canManage: boolean }) {
  const { data: files = [], isLoading } = useWorkOrderFiles(workOrder.id)
  const upload = useUploadWorkOrderReferences()
  const remove = useRemoveWorkOrderFile()
  const references = files.filter((file) => file.kind === 'reference')

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading files…</p>
      ) : references.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reference files yet.</p>
      ) : (
        <ul className="space-y-2">
          {references.map((file) => (
            <li key={file.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{file.name}</span>
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openWorkOrderFile(file).catch((error: unknown) => toast.error(errorMessage(error, 'Unable to open the file')))}
                >
                  Open
                </Button>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (!confirmAction(`Remove "${file.name}" from this work order?`)) return
                      remove
                        .mutateAsync(file)
                        .then(() => toast.success('File removed'))
                        .catch((error: unknown) => toast.error(errorMessage(error, 'Remove failed')))
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
      {canManage && workOrder.status !== 'closed' ? (
        <FilePickerButton
          accept={resolvedDocumentUploadAccept()}
          label="Add photos, drawings or PDFs"
          size="sm"
          variant="outline"
          multiple
          isLoading={upload.isPending}
          onFiles={async (selected) => {
            try {
              await upload.mutateAsync({ workOrder, files: selected })
              toast.success(selected.length === 1 ? 'File added' : `${selected.length} files added`)
            } catch (error) {
              toast.error(errorMessage(error, 'Upload failed'))
            }
          }}
        />
      ) : null}
    </div>
  )
}
