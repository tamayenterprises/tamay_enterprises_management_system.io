import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProfiles } from '@/features/data/hooks'
import { useSubcontractorReadiness } from '@/features/subcontractors/hooks'
import { fullName } from '@/lib/utils'
import type { DirectoryProfile } from '@/types/database'

const nameOf = (p: Pick<DirectoryProfile, 'company_name' | 'first_name' | 'last_name'>) => p.company_name || fullName(p.first_name, p.last_name)

/**
 * Choose one or more subcontractors to send a work order to. Collapsed by default (an accordion) so a
 * long list does not stretch the form. Not-ready subcontractors can be chosen but cannot start.
 */
export function SubcontractorPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: string[]
  onChange: (ids: string[], firstTrade: string | null) => void
  exclude?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: subcontractors = [] } = useProfiles({ role: 'subcontractor' })
  const options = subcontractors.filter(
    (p) => p.approval_status === 'approved' && p.is_active && !p.archived_at && !exclude.includes(p.id),
  )
  const { data: readiness } = useSubcontractorReadiness(options.map((p) => p.id))
  const term = search.trim().toLowerCase()
  const visible = term
    ? options.filter((p) => `${nameOf(p)} ${p.first_name} ${p.last_name} ${p.trade_specialization ?? ''}`.toLowerCase().includes(term))
    : options
  const chosen = options.filter((p) => selected.includes(p.id))

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
    const first = options.find((p) => p.id === next[0])
    onChange(next, first?.trade_specialization ?? null)
  }

  const summary =
    chosen.length === 0
      ? 'Choose subcontractors'
      : `${chosen.length} selected: ${chosen.slice(0, 2).map(nameOf).join(', ')}${chosen.length > 2 ? ` +${chosen.length - 2}` : ''}`

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Send to subcontractors</p>
      <p className="text-xs text-muted-foreground">
        Choose one or several. Each one can accept or decline — the first to accept gets the work order.
      </p>
      <div className="rounded-md border border-border">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={chosen.length ? 'font-medium' : 'text-muted-foreground'}>{summary}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {open ? (
          <div className="space-y-2 border-t border-border p-2" data-testid="subcontractor-picker-list">
            {options.length > 6 ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  className="pl-8"
                  placeholder="Search name or trade"
                  aria-label="Search subcontractors"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            ) : null}
            {options.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">No active subcontractors to choose from.</p>
            ) : visible.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">No subcontractor matches "{search}".</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {visible.map((p) => {
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
                          aria-label={nameOf(p)}
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{nameOf(p)}</span>
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
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setOpen(false)
                  setSearch('')
                }}
              >
                Done{chosen.length ? ` (${chosen.length})` : ''}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
