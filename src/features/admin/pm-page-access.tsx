import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useUpdatePmPageAccess } from '@/features/data/hooks'
import {
  APP_PAGE_LABELS,
  GRANTABLE_PM_PAGES,
  PM_ALWAYS_PAGES,
  resolvedPmPages,
  type AppPageKey,
} from '@/lib/page-access'
import type { Profile } from '@/types/database'

export function ProjectManagerPageAccess({ user }: { user: Profile }) {
  const updateAccess = useUpdatePmPageAccess()
  const [selected, setSelected] = useState<AppPageKey[]>(() => resolvedPmPages(user.granted_pages))

  useEffect(() => {
    setSelected(resolvedPmPages(user.granted_pages))
  }, [user.id, user.granted_pages])

  const toggle = (page: AppPageKey) => {
    setSelected((current) =>
      current.includes(page) ? current.filter((item) => item !== page) : [...current, page],
    )
  }

  return (
    <div className="rounded-md border border-border/80 bg-[#fbfcff] px-3 py-3">
      <p className="text-sm font-medium">Page access</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose which pages this project manager can open. Dashboard and Notifications stay on so they
        can sign in and see alerts.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PM_ALWAYS_PAGES.map((page) => (
          <label key={page} className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked disabled className="h-4 w-4 accent-[var(--color-accent)]" />
            {APP_PAGE_LABELS[page]}
          </label>
        ))}
        {GRANTABLE_PM_PAGES.map((page) => (
          <label key={page} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-accent)]"
              checked={selected.includes(page)}
              onChange={() => toggle(page)}
            />
            {APP_PAGE_LABELS[page]}
          </label>
        ))}
      </div>
      <Button
        size="sm"
        className="mt-3 min-h-11 w-full sm:w-auto"
        disabled={updateAccess.isPending}
        onClick={async () => {
          try {
            await updateAccess.mutateAsync({
              id: user.id,
              pages: [...new Set([...PM_ALWAYS_PAGES, ...selected.filter((page) => page !== 'admin')])],
            })
            toast.success('Page access updated')
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not update page access')
          }
        }}
      >
        Save page access
      </Button>
    </div>
  )
}
