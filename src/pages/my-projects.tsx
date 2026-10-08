import { useMemo, useState } from 'react'
import { ArrowUpDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MobileListGate, SeeMoreButton } from '@/components/ui/see-more-button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-hooks'
import { MyProjectCard } from '@/features/projects/my-project-card'
import { useMyProjectsData } from '@/features/projects/my-projects-hooks'
import {
  SORT_OPTIONS,
  STATUS_FILTERS,
  matchesSearch,
  matchesStatus,
  sortProjects,
  statusCounts,
  type MyProjectsSort,
  type StatusFilter,
} from '@/features/projects/my-projects-model'
import { STATUS_DOT } from '@/features/projects/my-projects-styles'
import { LIST_PREVIEW, useListPreview } from '@/lib/list-preview'
import { cn } from '@/lib/utils'

const SEARCH_PLACEHOLDER = 'Search projects, clients, or addresses…'
const ICON_BUTTON = 'flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-primary shadow-sm'

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-x-5 lg:p-3.5">
      <Skeleton className="aspect-[16/9] w-[62%] rounded-lg lg:aspect-[4/3] lg:w-full" />
      <div className="mt-3 space-y-3 lg:mt-1">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-12" />
        <Skeleton className="h-11" />
      </div>
    </div>
  )
}

/** Mobile sort: an icon-sized native picker so sorting never takes a full row. */
function CompactSort({ sort, onChange }: { sort: MyProjectsSort; onChange: (value: MyProjectsSort) => void }) {
  return (
    <div className="relative">
      <span className={cn(ICON_BUTTON, 'pointer-events-none')}>
        <ArrowUpDown className="h-4 w-4" aria-hidden />
      </span>
      <select
        aria-label="Sort projects"
        value={sort}
        onChange={(event) => onChange(event.target.value as MyProjectsSort)}
        className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Employee / subcontractor projects: one list of visual cards, quick actions, details on demand. */
export function MyProjectsPage() {
  const { profile } = useAuth()
  const { views, notesByProject, isLoading, isError } = useMyProjectsData()
  const [search, setSearch] = useState('')
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<MyProjectsSort>('next_visit')
  const showClient = profile?.role === 'employee'

  const searched = useMemo(() => views.filter((view) => matchesSearch(view, search)), [views, search])
  const counts = useMemo(() => statusCounts(searched), [searched])
  const visible = useMemo(
    () => sortProjects(searched.filter((view) => matchesStatus(view, status)), sort),
    [searched, status, sort],
  )
  const list = useListPreview(visible, `${search}:${status}:${sort}`)
  const filtered = Boolean(search.trim()) || status !== 'all'
  const showMobileSearch = mobileSearchOpen || Boolean(search)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="space-y-3 lg:space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 md:flex-nowrap md:items-center">
          <div className="min-w-0">
            <h1 className="font-serif text-[28px] font-bold leading-tight text-primary lg:text-[34px]">My Projects</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Loading your projects…' : `${views.length} assigned project${views.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2 md:hidden">
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={showMobileSearch ? 'Close search' : 'Search projects'}
              aria-expanded={showMobileSearch}
              onClick={() => {
                if (showMobileSearch) setSearch('')
                setMobileSearchOpen(!showMobileSearch)
              }}
            >
              {showMobileSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
            <CompactSort sort={sort} onChange={setSort} />
          </div>
          <div
            data-testid="search-row"
            className={cn('relative w-full md:w-[400px] md:shrink-0', showMobileSearch ? 'block' : 'hidden md:block')}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              autoFocus={mobileSearchOpen}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label="Search projects"
              className="h-10 rounded-lg bg-white pl-9 shadow-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label="Filter by status"
            className="-mx-3 flex min-w-0 flex-1 snap-x scroll-px-3 gap-1.5 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:gap-2 md:px-0"
          >
            {STATUS_FILTERS.map((filter) => {
              const active = status === filter.value
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${filter.label} (${counts[filter.value]})`}
                  onClick={() => setStatus(filter.value)}
                  className={cn(
                    'inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-lg md:px-3.5',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-white text-primary hover:border-primary/30 hover:bg-[#f3f8fc]',
                  )}
                >
                  {filter.value === 'all' ? null : (
                    <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[filter.value])} aria-hidden />
                  )}
                  {filter.label}
                  {filter.value === 'all' ? <span className="hidden md:inline"> Projects</span> : null}
                  <span
                    className={cn(
                      'min-w-5 rounded-md px-1.5 py-0.5 text-center text-[11px] font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {counts[filter.value]}
                  </span>
                </button>
              )
            })}
          </div>
          <label className="hidden shrink-0 items-center gap-2 text-[13px] font-medium text-muted-foreground md:flex">
            <span>Sort by</span>
            <NativeSelect
              aria-label="Sort by"
              value={sort}
              onChange={(event) => setSort(event.target.value as MyProjectsSort)}
              className="h-9 w-48 rounded-lg text-[13px] font-medium text-primary"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <EmptyState title="Unable to load your projects" description="Check your connection and try again." />
      ) : views.length === 0 ? (
        <EmptyState
          title="No projects assigned yet"
          description="When management assigns you to a project, it will show up here."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No projects match"
          description="Try a different search or status."
          action={
            filtered ? (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setSearch('')
                  setStatus('all')
                }}
              >
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <MobileListGate>
        <div data-testid="my-projects-list" className="flex flex-col gap-3 lg:gap-4">
          {list.visible.map((view) => (
            <MyProjectCard
              key={view.project.id}
              view={view}
              notes={notesByProject?.get(view.project.id)}
              showClient={showClient}
            />
          ))}
          <SeeMoreButton shown={list.shown} total={list.total} step={LIST_PREVIEW} onMore={list.showMore} />
        </div>
        </MobileListGate>
      )}
    </div>
  )
}
