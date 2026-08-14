import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  createProjectRequestFileSignedUrl,
  useConvertProjectRequest,
  useManagementProjectRequests,
  useReviewProjectRequest,
} from '@/features/client/hooks'
import { formatFileSize, formatRelative, fullName } from '@/lib/utils'

export function ProjectRequestsAdminPage() {
  const { data: requests = [], isLoading, isError } = useManagementProjectRequests('open')
  const review = useReviewProjectRequest()
  const convert = useConvertProjectRequest()

  if (isLoading) return <LoadingState label="Loading client requests..." />
  if (isError) return <EmptyState title="Unable to load client project requests" />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Client project requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review client submissions, then convert approved requests into Tamay projects.
        </p>
      </div>

      {requests.length === 0 ? (
        <EmptyState title="No open client requests" description="New client requests will appear here." />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">{request.title}</CardTitle>
                  <Badge variant="outline">{request.status.replace(/_/g, ' ')}</Badge>
                </div>
                <CardDescription>
                  {request.client
                    ? fullName(request.client.first_name, request.client.last_name)
                    : 'Client'}{' '}
                  · {request.location || 'No location'} · {formatRelative(request.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.description}</p>
                {request.files && request.files.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Attachments</p>
                    {request.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="block w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
                        onClick={async () => {
                          try {
                            const url = await createProjectRequestFileSignedUrl(file.storage_path)
                            window.open(url, '_blank', 'noopener,noreferrer')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Unable to open file')
                          }
                        }}
                      >
                        {file.name}
                        <span className="ml-2 text-muted-foreground">
                          {file.file_kind} · {formatFileSize(file.file_size ?? 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {request.status === 'pending' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={async () => {
                        try {
                          await review.mutateAsync({ requestId: request.id, status: 'under_review' })
                          toast.success('Marked under review')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Update failed')
                        }
                      }}
                    >
                      Mark under review
                    </Button>
                  ) : null}
                  {request.status !== 'approved' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={async () => {
                        try {
                          await review.mutateAsync({ requestId: request.id, status: 'approved' })
                          toast.success('Request approved')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Update failed')
                        }
                      }}
                    >
                      Approve
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={convert.isPending}
                    onClick={async () => {
                      try {
                        const project = await convert.mutateAsync(request.id)
                        toast.success('Converted to project')
                        // stay on page; link available below after refresh
                        void project
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Convert failed')
                      }
                    }}
                  >
                    Convert to project
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={review.isPending}
                    onClick={async () => {
                      try {
                        await review.mutateAsync({ requestId: request.id, status: 'declined' })
                        toast.success('Request declined')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Update failed')
                      }
                    }}
                  >
                    Decline
                  </Button>
                  {request.converted_project_id ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/projects/${request.converted_project_id}`}>Open project</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
