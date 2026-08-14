import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useMyFormDrafts } from '@/features/drafts/use-form-draft'
import { confirmAction } from '@/lib/uploads'
import { supabase } from '@/lib/supabase'

export function DraftsPage() {
  const { data = [], isLoading, isError, refetch } = useMyFormDrafts()

  if (isLoading) return <LoadingState label="Loading drafts..." />
  if (isError) return <EmptyState title="Unable to load drafts" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Drafts</h1>
        <p className="text-sm text-muted-foreground">
          Your unfinished work is saved privately for 30 days. Drafts never notify other users.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Active drafts</CardTitle>
          <CardDescription>Continue writing or delete drafts you no longer need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.length === 0 ? (
            <EmptyState title="No active drafts" description="Start a project update or new project to create one." />
          ) : (
            data.map((draft) => {
              const preview =
                typeof draft.payload?.content === 'string'
                  ? draft.payload.content
                  : typeof draft.payload?.name === 'string'
                    ? draft.payload.name
                    : typeof draft.payload?.explanation === 'string'
                      ? draft.payload.explanation
                      : 'Untitled draft'
              const continueTo =
                draft.draft_type === 'NEW_PROJECT'
                  ? '/projects'
                  : draft.project_id
                    ? `/projects/${draft.project_id}`
                    : draft.draft_type === 'COMPANY_UPDATE'
                      ? '/updates'
                      : '/dashboard'
              return (
                <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{draft.draft_type.replaceAll('_', ' ')}</p>
                    <p className="truncate text-sm text-muted-foreground">{String(preview).slice(0, 120)}</p>
                    <p className="text-xs text-muted-foreground">
                      Saved {format(new Date(draft.last_saved_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm">
                      <Link to={continueTo}>Continue</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!confirmAction('Delete this unfinished draft? This action cannot be undone.')) return
                        const { error } = await supabase.rpc('discard_form_draft', { p_draft_id: draft.id })
                        if (error) {
                          toast.error(error.message)
                          return
                        }
                        toast.success('Draft deleted.')
                        void refetch()
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
