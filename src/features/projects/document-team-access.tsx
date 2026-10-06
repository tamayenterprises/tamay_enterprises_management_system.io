import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSetDocumentTeamVisibility } from '@/features/data/hooks'
import { documentVisibilityHelp, documentVisibilityLabel } from '@/lib/document-visibility'
import { cn } from '@/lib/utils'
import type { DocumentRecord } from '@/types/database'

/** Management-only control. Access is enforced by the database; this only flips the flag. */
export function DocumentTeamAccess({ doc }: { doc: DocumentRecord }) {
  const setVisibility = useSetDocumentTeamVisibility()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const teamVisible = Boolean(doc.team_visible)
  const working = setVisibility.isPending
  const switchId = `team-access-${doc.id}`

  async function apply(next: boolean) {
    try {
      await setVisibility.mutateAsync({ doc, teamVisible: next })
      toast.success(next ? 'Shared with the project team' : 'Project team access removed')
      setConfirmOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update access')
    }
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-md bg-muted/40 px-2.5 py-2">
      <p className="text-xs font-medium text-muted-foreground">{documentVisibilityLabel(teamVisible)}</p>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={switchId} className="text-sm font-medium">
          Visible to Project Team
        </label>
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={teamVisible}
          disabled={working}
          onClick={() => (teamVisible ? void apply(false) : setConfirmOpen(true))}
          className={cn(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            teamVisible ? 'bg-primary' : 'bg-muted-foreground/35',
          )}
        >
          <span
            className={cn(
              'inline-block h-6 w-6 rounded-full bg-white shadow transition-transform',
              teamVisible ? 'translate-x-5' : 'translate-x-0',
            )}
          />
          <span className="sr-only">{teamVisible ? 'On' : 'Off'}</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{documentVisibilityHelp(teamVisible)}</p>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !working) setConfirmOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share document with project team?</DialogTitle>
            <DialogDescription>
              Assigned team members on this project will be able to open this document. Client and management
              access will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11" disabled={working} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11" disabled={working} onClick={() => void apply(true)}>
              {working ? 'Sharing…' : 'Share with Team'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
