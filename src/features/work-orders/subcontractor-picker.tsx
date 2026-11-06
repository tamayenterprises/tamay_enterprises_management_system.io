import { useProfiles } from '@/features/data/hooks'
import { useSubcontractorReadiness } from '@/features/subcontractors/hooks'
import { fullName } from '@/lib/utils'

/** Choose one or more subcontractors to send a work order to. Not-ready ones can be chosen but cannot start. */
export function SubcontractorPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: string[]
  onChange: (ids: string[], firstTrade: string | null) => void
  exclude?: string[]
}) {
  const { data: subcontractors = [] } = useProfiles({ role: 'subcontractor' })
  const options = subcontractors.filter(
    (p) => p.approval_status === 'approved' && p.is_active && !p.archived_at && !exclude.includes(p.id),
  )
  const { data: readiness } = useSubcontractorReadiness(options.map((p) => p.id))

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
    const first = options.find((p) => p.id === next[0])
    onChange(next, first?.trade_specialization ?? null)
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Send to subcontractors</legend>
      <p className="text-xs text-muted-foreground">
        Choose one or several. Each one can accept or decline — the first to accept gets the work order.
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active subcontractors to choose from.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {options.map((p) => {
            const status = readiness?.get(p.id)
            const notReady = status && status.status !== 'ready'
            const blockers = status ? [...status.attention_labels, ...status.missing_labels, ...status.pending_labels] : []
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={p.company_name || fullName(p.first_name, p.last_name)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{p.company_name || fullName(p.first_name, p.last_name)}</span>
                    {p.trade_specialization ? <span className="text-muted-foreground"> · {p.trade_specialization}</span> : null}
                    {notReady ? (
                      <span className="block text-xs font-semibold text-destructive">
                        NOT READY TO WORK{blockers.length ? ` — ${blockers.join(', ')}` : ''}. Can accept, cannot start until Ready.
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {selected.length > 0 ? (
        <p className="text-xs font-medium">
          {selected.length} selected
        </p>
      ) : null}
    </fieldset>
  )
}
