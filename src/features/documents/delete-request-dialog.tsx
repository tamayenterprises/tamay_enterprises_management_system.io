import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function DeleteRequestDialog({
  open,
  itemName,
  itemKind,
  reason,
  submitting,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  itemName?: string
  itemKind: 'document' | 'certification'
  reason: string
  submitting: boolean
  onReasonChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const noun = itemKind === 'certification' ? 'certification' : 'document'
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request {noun} delete</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This stays Pending until an admin approves or denies it
          {itemName ? ` (${itemName}).` : '.'}
        </p>
        <div className="space-y-2">
          <Label htmlFor="delete-request-reason">Why do you want to delete this {noun}?</Label>
          <Textarea
            id="delete-request-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Give a short reason for the admin."
            rows={4}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
