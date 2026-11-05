import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  openWorkOrderFile,
  useAddWorkOrderUpdate,
  useWorkOrderFiles,
  useWorkOrderPhotoUrls,
  useWorkOrderUpdates,
} from '@/features/work-orders/hooks'
import { resolvedImageUploadAccept } from '@/lib/uploads'
import { formatDate, fullName } from '@/lib/utils'
import type { WorkOrderFileRecord, WorkOrderRecord } from '@/types/database'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/** Work updates (Tamay internal only). The subcontractor can add one while the work order is In Progress. */
export function WorkOrderUpdates({ workOrder, canAdd }: { workOrder: WorkOrderRecord; canAdd: boolean }) {
  const { data: updates = [], isLoading } = useWorkOrderUpdates(workOrder.id)
  const { data: files = [] } = useWorkOrderFiles(workOrder.id)
  const photos = files.filter((file) => file.kind === 'update_photo')
  const { data: urls } = useWorkOrderPhotoUrls(photos.map((photo) => photo.storage_path))

  return (
    <div className="space-y-3">
      {canAdd ? <AddUpdateForm workOrderId={workOrder.id} /> : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading updates…</p>
      ) : updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <ol className="space-y-3">
          {updates.map((update) => {
            const updatePhotos = photos.filter((photo) => photo.update_id === update.id)
            const author = update.author
            return (
              <li key={update.id} className="space-y-1 rounded-md border border-border px-3 py-2 text-sm" data-testid="work-order-update">
                <p className="text-xs text-muted-foreground">
                  {author ? author.company_name || fullName(author.first_name, author.last_name) : 'Team'} ·{' '}
                  {formatDate(update.created_at, 'MMM d, yyyy h:mm a')}
                </p>
                {update.completed_today ? <UpdateLine label="Completed today" text={update.completed_today} /> : null}
                {update.next_steps ? <UpdateLine label="Next" text={update.next_steps} /> : null}
                {update.issue_question ? <UpdateLine label="Issue / question" text={update.issue_question} highlight /> : null}
                {updatePhotos.length > 0 ? <PhotoGrid photos={updatePhotos} urls={urls} /> : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function UpdateLine({ label, text, highlight = false }: { label: string; text: string; highlight?: boolean }) {
  return (
    <p className={highlight ? 'font-medium text-destructive' : undefined}>
      <span className="text-muted-foreground">{label}:</span> <span className="whitespace-pre-line">{text}</span>
    </p>
  )
}

function PhotoGrid({ photos, urls }: { photos: WorkOrderFileRecord[]; urls?: Map<string, string> }) {
  return (
    <div className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-4">
      {photos.map((photo) => {
        const url = urls?.get(photo.storage_path)
        return (
          <button
            key={photo.id}
            type="button"
            className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
            aria-label={`Open ${photo.name}`}
            onClick={() => void openWorkOrderFile(photo).catch((error: unknown) => toast.error(errorMessage(error, 'Unable to open the photo')))}
          >
            {url ? <img src={url} alt={photo.name} className="h-full w-full object-cover" loading="lazy" /> : null}
          </button>
        )
      })}
    </div>
  )
}

function AddUpdateForm({ workOrderId }: { workOrderId: string }) {
  const add = useAddWorkOrderUpdate()
  const [completedToday, setCompletedToday] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [issueQuestion, setIssueQuestion] = useState('')
  const [photos, setPhotos] = useState<File[]>([])

  async function onSubmit() {
    try {
      await add.mutateAsync({ workOrderId, completedToday, nextSteps, issueQuestion, photos })
      toast.success('Update sent to Tamay')
      setCompletedToday('')
      setNextSteps('')
      setIssueQuestion('')
      setPhotos([])
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the update'))
    }
  }

  return (
    <section className="space-y-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
      <h3 className="text-sm font-semibold">Add Update</h3>
      <div className="space-y-1">
        <Label htmlFor="wo-update-done">Completed today</Label>
        <Textarea id="wo-update-done" rows={2} maxLength={2000} value={completedToday} onChange={(e) => setCompletedToday(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wo-update-next">Next</Label>
        <Textarea id="wo-update-next" rows={2} maxLength={2000} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wo-update-issue">Issue / question</Label>
        <Textarea id="wo-update-issue" rows={2} maxLength={2000} value={issueQuestion} onChange={(e) => setIssueQuestion(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FilePickerButton
          accept={resolvedImageUploadAccept()}
          label={photos.length > 0 ? 'Add more photos' : 'Add photos'}
          size="sm"
          variant="outline"
          multiple
          selectedFiles={photos}
          onFiles={(selected) => setPhotos(selected.slice(0, 20))}
        />
        <p className="text-xs text-muted-foreground">{photos.length > 0 ? `${photos.length} photo${photos.length === 1 ? '' : 's'} selected` : 'Up to 20 photos'}</p>
      </div>
      <SelectedFilesList files={photos} onChange={setPhotos} />
      <p className="text-xs text-muted-foreground">Updates are for Tamay only. Clients do not see them.</p>
      <Button size="sm" disabled={add.isPending} onClick={() => void onSubmit()}>
        {add.isPending ? 'Sending…' : 'Send update'}
      </Button>
    </section>
  )
}
