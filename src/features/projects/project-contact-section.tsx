import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMyProjectContact } from '@/features/data/hooks'
import { formatPhoneDisplay, phoneHref } from '@/features/schedule/schedule-links'

/** Employee view of the project's client contact (Primary Client, else earliest client). */
export function ProjectContactSection({ projectId }: { projectId: string }) {
  const { data: contact, isLoading, isError } = useMyProjectContact(projectId)
  const name = contact?.client_name?.trim() || null
  const tel = phoneHref(contact?.client_phone)
  const phoneLabel = formatPhoneDisplay(contact?.client_phone)

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Project contact</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading contact…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Project contact is unavailable right now.</p>
      ) : !name && !phoneLabel ? (
        <p className="text-sm text-muted-foreground">No project contact on file</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">{name || 'Client'}</p>
            {phoneLabel ? (
              <p className="text-base font-semibold tracking-wide">{phoneLabel}</p>
            ) : (
              <p className="text-xs text-muted-foreground">No phone number on file</p>
            )}
          </div>
          {tel ? (
            <Button asChild className="min-h-11 w-full sm:w-auto">
              <a href={tel} aria-label={`Call ${name || 'project contact'}`}>
                <Phone className="h-4 w-4" />
                Call
              </a>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
