import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  useClearProfileAssignments,
  useProfileAssignments,
  useRemoveAssignment,
} from '@/features/data/hooks'
import { confirmAction } from '@/lib/uploads'
import { projectStatusLabel } from '@/lib/utils'

/** Lists a person's active projects with per-job Unassign (and Unassign all). */
export function ProfileAssignmentsPanel({
  profileId,
  personLabel,
  compact = false,
}: {
  profileId: string
  personLabel: string
  compact?: boolean
}) {
  const { data: assignments = [], isLoading } = useProfileAssignments(profileId)
  const removeAssignment = useRemoveAssignment()
  const clearAll = useClearProfileAssignments()

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading projects…</p>
  }

  if (assignments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No active project assignments.
      </p>
    )
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Assigned projects ({assignments.length})
        </p>
        {assignments.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={clearAll.isPending || removeAssignment.isPending}
            onClick={async () => {
              if (
                !confirmAction(
                  `Unassign ${personLabel} from all ${assignments.length} projects? They can be reassigned later.`,
                )
              ) {
                return
              }
              try {
                const count = await clearAll.mutateAsync(profileId)
                toast.success(
                  count === 1 ? 'Unassigned from 1 project' : `Unassigned from ${count} projects`,
                )
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unassign failed')
              }
            }}
          >
            Unassign all
          </Button>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {assignments.map((assignment) => {
          const project = assignment.project
          const name = project?.name ?? 'Project'
          return (
            <li
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <Link
                  to={`/projects/${assignment.project_id}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {name}
                </Link>
                {project?.status ? (
                  <span className="ml-2 text-muted-foreground">
                    {projectStatusLabel(project.status)}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                disabled={removeAssignment.isPending || clearAll.isPending}
                onClick={async () => {
                  if (
                    !confirmAction(
                      `Unassign ${personLabel} from “${name}”? Use this when they are done or being replaced.`,
                    )
                  ) {
                    return
                  }
                  try {
                    await removeAssignment.mutateAsync({
                      assignmentId: assignment.id,
                      projectId: assignment.project_id,
                      profileId: assignment.profile_id,
                    })
                    toast.success('Unassigned from project')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Unassign failed')
                  }
                }}
              >
                Unassign
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
