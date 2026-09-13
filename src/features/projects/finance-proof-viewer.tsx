import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  createPaymentProofSignedUrl,
  createReceiptProofSignedUrl,
  loadPaymentProofForViewing,
  loadReceiptProofForViewing,
  type FinanceProofViewPayload,
} from '@/features/projects/finance-hooks'

/**
 * In-app payment/receipt proof viewer.
 * Prefer authenticated blob download (surfaces RLS errors clearly) over a blank new-tab open.
 */
export function FinanceProofViewer({
  open,
  onOpenChange,
  proof,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  proof: FinanceProofViewPayload | null
}) {
  useEffect(() => {
    return () => {
      if (proof?.revokeUrl) URL.revokeObjectURL(proof.url)
    }
  }, [proof])

  const isPdf =
    Boolean(proof?.mimeType?.includes('pdf')) ||
    Boolean(proof?.fileName?.toLowerCase().endsWith('.pdf'))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && proof?.revokeUrl) URL.revokeObjectURL(proof.url)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{proof?.title ?? 'Proof'}</DialogTitle>
        </DialogHeader>
        {!proof ? (
          <p className="text-sm text-muted-foreground">No file loaded.</p>
        ) : isPdf ? (
          <iframe title={proof.title} src={proof.url} className="h-[70vh] w-full rounded-md border bg-white" />
        ) : (
          <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-md bg-muted/30 p-2">
            <img
              src={proof.url}
              alt={proof.fileName || 'Payment proof'}
              className="max-h-[68vh] max-w-full object-contain"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={proof?.url} target="_blank" rel="noopener noreferrer">
              Open in new tab
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useFinanceProofViewer() {
  const [open, setOpen] = useState(false)
  const [proof, setProof] = useState<FinanceProofViewPayload | null>(null)

  async function openPaymentProof(paymentId: string, title = 'Payment proof') {
    try {
      const loaded = await loadPaymentProofForViewing(paymentId, title)
      setProof(loaded)
      setOpen(true)
    } catch (error) {
      // Fallback: try signed URL new-tab (admin path) if blob load fails for other reasons
      try {
        const url = await createPaymentProofSignedUrl(paymentId)
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        toast.error(error instanceof Error ? error.message : 'Unable to open payment proof')
      }
    }
  }

  async function openReceiptProof(receiptId: string, title = 'Receipt') {
    try {
      const loaded = await loadReceiptProofForViewing(receiptId, title)
      setProof(loaded)
      setOpen(true)
    } catch (error) {
      try {
        const url = await createReceiptProofSignedUrl(receiptId)
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        toast.error(error instanceof Error ? error.message : 'Unable to open receipt')
      }
    }
  }

  return {
    openPaymentProof,
    openReceiptProof,
    viewer: <FinanceProofViewer open={open} onOpenChange={setOpen} proof={proof} />,
  }
}
