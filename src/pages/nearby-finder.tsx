import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, ChevronDown, Crosshair, MapPin, Phone, Plus, Search, Store, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SeeMoreButton } from '@/components/ui/see-more-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-hooks'
import { canManageSavedPlaces } from '@/features/nearby/nearby-access'
import {
  PlacesNotConfiguredError,
  SavedPlacesNotInstalledError,
  projectSearchTarget,
  readNearbySession,
  useArchiveNearbyPlace,
  useNearbyProjects,
  usePlacesSearch,
  useSavedPlaces,
  writeNearbySession,
  type NearbySession,
  type OriginKind,
} from '@/features/nearby/nearby-hooks'
import {
  DEFAULT_RADIUS,
  RADIUS_OPTIONS,
  googleMapsSearchUrl,
  originCoords,
  rankSavedPlaces,
  type GooglePlaceHit,
  saveCategoryForSearch,
  savedCategories,
  searchCategories,
  type NearbyMode,
  type NearbyOrigin,
  type RadiusMiles,
  type RankedSavedPlace,
} from '@/features/nearby/nearby-model'
import { GooglePlaceCard } from '@/features/nearby/google-place-card'
import { SavePlaceDialog } from '@/features/nearby/save-place-dialog'
import { SavedPlaceCard } from '@/features/nearby/saved-place-card'
import { requestDeviceLocation } from '@/lib/geo'
import { useListPreview } from '@/lib/list-preview'
import { cn } from '@/lib/utils'
import type { NearbySavedPlace } from '@/types/database'

const SAVED_PREVIEW = 3
const SAVED_STEP = 5
const LOCATION_UNAVAILABLE = 'Location unavailable. Choose a project or enter an address.'
const SPECIFIC_PLACEHOLDER: Record<NearbyMode, string> = {
  suppliers: 'TracPipe, ProPEX, breaker...',
  food: 'Ceviche, empanadas, subs...',
}

const ORIGIN_OPTIONS: Array<{ value: OriginKind; label: string; icon: typeof Crosshair }> = [
  { value: 'project', label: 'Current Project', icon: Briefcase },
  { value: 'current', label: 'Current Location', icon: Crosshair },
  { value: 'entered', label: 'Enter Location', icon: MapPin },
]

const SECTION_TITLE = 'flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary'

/** Navy section label with a small gold marker. */
function GoldMark() {
  return <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
}

type DeviceState = { status: 'idle' | 'locating' } | { status: 'ready'; latitude: number; longitude: number } | { status: 'error' }

function SavedSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex gap-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-2.5 h-10" />
    </div>
  )
}

/** Field tool: pick where, tap what you need (Places in-app, Maps fallback), then Tamay's saved places. */
export function NearbyFinderPage() {
  const { profile } = useAuth()
  const canManage = canManageSavedPlaces(profile?.role)
  const [params] = useSearchParams()
  const projectsQuery = useNearbyProjects()
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const savedQuery = useSavedPlaces()
  const archive = useArchiveNearbyPlace()
  const placesSearch = usePlacesSearch()

  const [initial] = useState(() => {
    const session = readNearbySession()
    const urlProject = params.get('project')
    const urlMode = params.get('mode')
    return {
      mode: (urlMode === 'food' || urlMode === 'suppliers' ? urlMode : session.mode ?? 'suppliers') as NearbyMode,
      originKind: (urlProject ? 'project' : session.originKind ?? 'project') as OriginKind,
      projectId: urlProject ?? session.projectId ?? null,
      radius: session.radius ?? DEFAULT_RADIUS,
      lastSearch: session.lastSearch ?? null,
    }
  })

  const [mode, setMode] = useState<NearbyMode>(initial.mode)
  const [originKind, setOriginKind] = useState<OriginKind>(initial.originKind)
  const [projectId, setProjectId] = useState<string | null>(initial.projectId)
  const [radius, setRadius] = useState<RadiusMiles>(initial.radius)
  const [lastSearch, setLastSearch] = useState<NearbySession['lastSearch']>(initial.lastSearch)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [specificOpen, setSpecificOpen] = useState(false)
  const [category, setCategory] = useState('all')
  const [specific, setSpecific] = useState('')
  const [addressInput, setAddressInput] = useState('')
  const [enteredAddress, setEnteredAddress] = useState<string | null>(null)
  const [device, setDevice] = useState<DeviceState>({ status: 'idle' })
  const [dialog, setDialog] = useState<{ open: boolean; place: NearbySavedPlace | null }>({ open: false, place: null })
  const [googleHits, setGoogleHits] = useState<GooglePlaceHit[] | null>(null)
  const [googleLabel, setGoogleLabel] = useState<string | null>(null)
  const [googleQuery, setGoogleQuery] = useState<string | null>(null)
  const locateTicket = useRef(0)

  useEffect(() => {
    writeNearbySession({ mode, originKind, projectId, radius, lastSearch })
  }, [mode, originKind, projectId, radius, lastSearch])

  useEffect(() => {
    if (originKind !== 'project' || projectId || !projects[0]) return
    setProjectId(projects[0].id)
  }, [originKind, projectId, projects])

  const locate = useCallback(async () => {
    const ticket = ++locateTicket.current
    setDevice({ status: 'locating' })
    try {
      const here = await requestDeviceLocation({ enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 })
      if (ticket === locateTicket.current) setDevice({ status: 'ready', latitude: here.latitude, longitude: here.longitude })
    } catch {
      if (ticket === locateTicket.current) setDevice({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    if (originKind === 'current' && device.status === 'idle') void locate()
  }, [originKind, device.status, locate])

  const project = projects.find((item) => item.id === projectId) ?? null
  const origin = useMemo<NearbyOrigin | null>(() => {
    if (originKind === 'project') {
      if (!project) return null
      const target = projectSearchTarget(project)
      if (!target.coords && !target.address) return null
      return {
        source: 'project',
        label: project.name,
        latitude: target.coords?.latitude ?? null,
        longitude: target.coords?.longitude ?? null,
        address: target.address,
      }
    }
    if (originKind === 'current') {
      return device.status === 'ready'
        ? { source: 'current', label: 'your current location', latitude: device.latitude, longitude: device.longitude, address: null }
        : null
    }
    return enteredAddress ? { source: 'entered', label: enteredAddress, latitude: null, longitude: null, address: enteredAddress } : null
  }, [originKind, project, device, enteredAddress])

  const originProblem =
    originKind === 'current' && device.status === 'error'
      ? LOCATION_UNAVAILABLE
      : originKind === 'project' && !projectsQuery.isLoading && projects.length === 0
        ? 'No assigned projects yet. Use Current Location or Enter Location.'
        : originKind === 'project' && project && !origin
          ? 'This project has no job-site address yet. Use Current Location or Enter Location.'
          : null

  const saved = useMemo(() => savedQuery.data ?? [], [savedQuery.data])
  const ranked = useMemo(
    () => rankSavedPlaces(saved, { mode, category, text: '', origin, radiusMiles: radius }),
    [saved, mode, category, origin, radius],
  )
  const list = useListPreview(ranked, `${mode}:${category}:${radius}:${origin?.label}`, SAVED_STEP, SAVED_PREVIEW)
  const hasCoords = Boolean(originCoords(origin))
  const notInstalled = savedQuery.error instanceof SavedPlacesNotInstalledError
  const nextRadius = RADIUS_OPTIONS.find((miles) => miles > radius) ?? null
  const term = specific.trim()
  const savedTitle = mode === 'suppliers' ? 'Saved Suppliers Nearby' : 'Crew Favorites Nearby'
  const saveDefaultCategory =
    category !== 'all' ? category : lastSearch?.mode === mode ? saveCategoryForSearch(mode, lastSearch.category) : null

  function chooseMode(next: NearbyMode) {
    setMode(next)
    setCategory('all')
    setSpecific('')
    setSpecificOpen(false)
    setGoogleHits(null)
    setGoogleLabel(null)
    setGoogleQuery(null)
  }

  function chooseOrigin(kind: OriginKind) {
    setOriginKind(kind)
    if (kind === 'current' && device.status !== 'locating') void locate()
  }

  function searchSpecific(event: React.FormEvent) {
    event.preventDefault()
    if (!term) return
    setLastSearch(null)
    void runPlacesSearch(term, term)
  }

  async function runPlacesSearch(query: string, label: string) {
    if (!origin) {
      toast.error('Choose a project, your location, or an address first.')
      return
    }
    setGoogleLabel(label)
    setGoogleQuery(query)
    try {
      const hits = await placesSearch.mutateAsync({ query, origin, radiusMiles: radius })
      setGoogleHits(hits)
    } catch (error) {
      setGoogleHits([])
      window.open(googleMapsSearchUrl(query, origin), '_blank', 'noopener,noreferrer')
      if (error instanceof PlacesNotConfiguredError) {
        toast.message('Opening Google Maps. Add the Places API key in Supabase secrets to show results here.')
        return
      }
      toast.error(error instanceof Error ? error.message : 'Search failed. Opened Google Maps instead.')
    }
  }

  async function archivePlace(place: RankedSavedPlace) {
    if (!window.confirm(`Archive "${place.business_name}"? It will no longer show for the crew.`)) return
    try {
      await archive.mutateAsync(place.id)
      toast.success('Saved place archived')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not archive')
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-primary lg:text-[30px]">Nearby Finder</h1>
            <p className="text-sm text-muted-foreground">Find nearby suppliers and great food options for your crew.</p>
          </div>
          {canManage ? (
            <Button
              className="h-10 shrink-0 gap-1.5 bg-accent text-primary shadow-sm hover:bg-accent/90"
              onClick={() => setDialog({ open: true, place: null })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Save Place
            </Button>
          ) : null}
        </div>

        <div role="group" aria-label="Finder mode" className="grid grid-cols-2 gap-2 lg:inline-grid lg:w-[440px]">
          {(
            [
              { value: 'suppliers', label: 'Suppliers', icon: Store },
              { value: 'food', label: 'Food', icon: UtensilsCrossed },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => chooseMode(option.value)}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10',
                mode === option.value
                  ? 'bg-accent text-primary shadow-sm'
                  : 'border border-primary/15 bg-white text-primary hover:border-primary/40',
              )}
            >
              <option.icon className="h-4 w-4" aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
        <div className="space-y-4">
          <section aria-labelledby="nearby-search-near" className="space-y-2">
            <h2 id="nearby-search-near" className={SECTION_TITLE}>
              <GoldMark />
              Search Near
            </h2>
            <div role="group" aria-label="Search near" className="grid grid-cols-3 gap-1.5 lg:flex lg:gap-2">
              {ORIGIN_OPTIONS.map((option) => {
                const active = originKind === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseOrigin(option.value)}
                    className={cn(
                      'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs lg:h-10 lg:px-3.5 lg:text-[13px]',
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-[inset_0_-3px_0_0_var(--color-accent)]'
                        : 'border-primary/15 bg-white text-primary hover:border-primary/40',
                      option.value === 'project' && !active && 'border-accent',
                    )}
                  >
                    <option.icon className={cn('hidden h-4 w-4 shrink-0 sm:block', active && 'text-accent')} aria-hidden />
                    <span className="truncate">{option.label}</span>
                  </button>
                )
              })}
            </div>

            {originKind === 'project' && projects.length > 0 ? (
              <NativeSelect
                aria-label="Project"
                value={projectId ?? ''}
                onChange={(event) => setProjectId(event.target.value || null)}
                className="h-11 rounded-lg text-sm font-medium text-primary lg:h-10 lg:max-w-md"
              >
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
            {originKind === 'entered' ? (
              <form
                className="flex gap-2 lg:max-w-xl"
                onSubmit={(event) => {
                  event.preventDefault()
                  setEnteredAddress(addressInput.trim() || null)
                }}
              >
                <Input
                  value={addressInput}
                  onChange={(event) => setAddressInput(event.target.value)}
                  placeholder="Address, town, or ZIP"
                  aria-label="Location"
                  className="h-11 rounded-lg bg-white lg:h-10"
                />
                <Button type="submit" className="h-11 shrink-0 lg:h-10" disabled={!addressInput.trim()}>
                  Use
                </Button>
              </form>
            ) : null}
            {originProblem ? (
              <div role="alert" className="flex flex-col gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
                <span>{originProblem}</span>
                <span className="flex gap-2">
                  {originKind !== 'project' && projects.length > 0 ? (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => chooseOrigin('project')}>
                      Use a Project
                    </Button>
                  ) : null}
                  {originKind === 'project' ? (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => chooseOrigin('current')}>
                      Current Location
                    </Button>
                  ) : null}
                  {originKind !== 'entered' ? (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => chooseOrigin('entered')}>
                      Enter Location
                    </Button>
                  ) : null}
                </span>
              </div>
            ) : null}
            {origin ? (
              <p className="truncate text-xs text-muted-foreground">
                Searching near <span className="font-semibold text-primary">{origin.source === 'current' ? 'your current location' : origin.label}</span>
                {origin.source === 'project' && origin.address ? ` · ${origin.address}` : null}
              </p>
            ) : originKind === 'current' && device.status === 'locating' ? (
              <p className="text-xs text-muted-foreground">Finding your location…</p>
            ) : null}
          </section>

          <section
            aria-label="Search by category"
            className={cn(
              'overflow-hidden rounded-xl border bg-white shadow-sm transition-colors',
              categoriesOpen ? 'border-accent' : 'border-primary/15',
            )}
          >
            <button
              type="button"
              aria-expanded={categoriesOpen}
              aria-controls="nearby-categories"
              onClick={() => setCategoriesOpen((value) => !value)}
              className={cn(
                'flex h-12 w-full items-center justify-between px-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                categoriesOpen && 'bg-accent/10',
              )}
            >
              <span className={SECTION_TITLE}>
                <GoldMark />
                Search by Category
              </span>
              <ChevronDown className={cn('h-5 w-5 text-primary transition-transform', categoriesOpen && 'rotate-180')} aria-hidden />
            </button>
            {categoriesOpen ? (
              <div id="nearby-categories" className="grid grid-cols-2 gap-2 border-t border-accent/40 p-3 sm:grid-cols-3 xl:grid-cols-4">
                {searchCategories(mode).map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={placesSearch.isPending}
                    onClick={() => {
                      setLastSearch({ mode, category: item.key })
                      void runPlacesSearch(item.search!, item.label)
                    }}
                    className={cn(
                      'inline-flex h-11 min-w-0 items-center justify-between gap-1.5 rounded-lg border px-3 text-[13px] font-semibold text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      mode === 'food' && index < 3
                        ? 'border-accent bg-accent/15 hover:bg-accent/25'
                        : 'border-primary/15 bg-white hover:border-primary/40',
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    <Search className="h-3.5 w-3.5 shrink-0 text-primary/50" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  aria-expanded={specificOpen}
                  aria-controls="nearby-specific-search"
                  onClick={() => setSpecificOpen((value) => !value)}
                  className={cn(
                    'col-span-full inline-flex h-11 min-w-0 items-center justify-between gap-1.5 rounded-lg border px-3 text-left text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    specificOpen
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-dashed border-primary/40 bg-white text-primary hover:border-primary',
                  )}
                >
                  <span className="truncate">Search Something Specific</span>
                  <Search className={cn('h-3.5 w-3.5 shrink-0', specificOpen ? 'text-accent' : 'text-primary/60')} aria-hidden />
                </button>
                {specificOpen ? (
                  <form id="nearby-specific-search" onSubmit={searchSpecific} className="col-span-full flex gap-2">
                    <Input
                      type="search"
                      enterKeyHint="search"
                      autoFocus
                      value={specific}
                      onChange={(event) => setSpecific(event.target.value)}
                      placeholder={SPECIFIC_PLACEHOLDER[mode]}
                      aria-label="Search something specific"
                      className="h-11 min-w-0 flex-1 rounded-lg border-primary/30 bg-white lg:h-10"
                    />
                    <Button type="submit" className="h-11 shrink-0 lg:h-10" disabled={!term}>
                      Search
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </section>

          {googleLabel ? (
            <section aria-labelledby="nearby-google" className="space-y-2.5">
              <div>
                <h2 id="nearby-google" className={SECTION_TITLE}>
                  <GoldMark />
                  Nearby on Google
                </h2>
                <p className="text-xs text-muted-foreground">
                  {placesSearch.isPending
                    ? `Finding ${googleLabel} nearby…`
                    : googleHits && googleHits.length > 0
                      ? `Nearest ${googleLabel} around your search area.`
                      : `No Google results for ${googleLabel} yet.`}
                </p>
              </div>
              {placesSearch.isPending ? (
                <>
                  <SavedSkeleton />
                  <SavedSkeleton />
                </>
              ) : googleHits && googleHits.length > 0 ? (
                <div className="grid gap-2.5 xl:grid-cols-2">
                  {googleHits.map((place) => (
                    <GooglePlaceCard key={place.id} place={place} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={`No Google places for ${googleLabel}`}
                  description="Saved Tamay places are still listed below."
                  action={
                    origin ? (
                      <Button asChild variant="outline" className="h-10">
                        <a href={googleMapsSearchUrl(googleQuery || googleLabel, origin)} target="_blank" rel="noopener noreferrer">
                          Open in Google Maps
                        </a>
                      </Button>
                    ) : null
                  }
                />
              )}
            </section>
          ) : null}

          <section aria-labelledby="nearby-saved" className="space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="nearby-saved" className={SECTION_TITLE}>
                  <GoldMark />
                  {savedTitle}
                </h2>
                {mode === 'suppliers' ? (
                  <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Phone className="h-3 w-3" aria-hidden />
                    {term ? 'Call to confirm availability.' : 'Call to confirm before driving.'}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label="Saved category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-9 w-[150px] rounded-lg text-xs font-semibold text-primary"
                >
                  <option value="all">All categories</option>
                  {savedCategories(mode).map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
                {hasCoords ? (
                  <div role="group" aria-label="Distance" className="flex gap-1">
                    {RADIUS_OPTIONS.map((miles) => (
                      <button
                        key={miles}
                        type="button"
                        aria-pressed={radius === miles}
                        onClick={() => setRadius(miles)}
                        className={cn(
                          'h-9 rounded-lg border px-2 text-xs font-semibold transition-colors sm:px-2.5',
                          radius === miles ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/15 bg-white text-primary hover:border-primary/40',
                        )}
                      >
                        {miles} mi
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {!hasCoords && origin ? (
              <p className="text-xs text-muted-foreground">
                Distances need verified project coordinates or your current location, so all saved places are listed.
              </p>
            ) : null}

            {savedQuery.isLoading ? (
              <>
                <SavedSkeleton />
                <SavedSkeleton />
              </>
            ) : notInstalled ? (
              <EmptyState
                title={canManage ? 'Saved places are not set up in this database yet.' : 'No saved places yet.'}
                description="Search by Category still works."
              />
            ) : savedQuery.isError ? (
              <EmptyState title="Saved places are temporarily unavailable." description="Search by Category still works." />
            ) : ranked.length === 0 ? (
              <EmptyState
                title={
                  hasCoords
                    ? `No saved ${mode === 'suppliers' ? 'suppliers' : 'food spots'} within ${radius} miles yet.`
                    : `No saved ${mode === 'suppliers' ? 'suppliers' : 'food spots'} yet.`
                }
                description={canManage ? 'Found a good one? Save it for the crew.' : undefined}
                action={
                  hasCoords && nextRadius ? (
                    <Button variant="outline" className="h-10" onClick={() => setRadius(nextRadius)}>
                      Expand to {nextRadius} miles
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div className="grid gap-2.5 xl:grid-cols-2">
                {list.visible.map((place) => (
                  <SavedPlaceCard
                    key={place.id}
                    place={place}
                    canManage={canManage}
                    onEdit={(item) => setDialog({ open: true, place: item })}
                    onArchive={(item) => void archivePlace(item)}
                  />
                ))}
                <div className="xl:col-span-2">
                  <SeeMoreButton shown={list.shown} total={list.total} step={SAVED_STEP} onMore={list.showMore} />
                </div>
              </div>
            )}
          </section>
        </div>

        <aside aria-label="Search area" className="hidden space-y-3 lg:sticky lg:top-[68px] lg:block">
          <div className="rounded-xl border border-primary/15 border-t-[3px] border-t-accent bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">Search area</p>
            {origin ? (
              <>
                <p className="mt-1 text-[15px] font-bold text-primary">
                  {origin.source === 'current' ? 'Your current location' : origin.label}
                </p>
                {origin.source === 'project' && origin.address ? <p className="text-sm text-muted-foreground">{origin.address}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasCoords ? 'Map location known: saved places show distance.' : 'Address only: distances are not shown.'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Choose a project, your location, or an address.</p>
            )}
          </div>
          <div className="rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm text-primary">
            <p className="font-semibold">Call before you drive</p>
            <p className="mt-0.5 text-xs">Tamay does not track stock or hours. A quick call saves a wasted trip.</p>
          </div>
        </aside>
      </div>

      {dialog.open ? (
        <SavePlaceDialog
          open
          onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
          mode={mode}
          category={dialog.place ? null : saveDefaultCategory}
          place={dialog.place}
        />
      ) : null}
    </div>
  )
}
