import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffRoute } from '@/features/auth/route-guards'
import { canManageSavedPlaces, canUseNearbyFinder } from '@/features/nearby/nearby-access'
import { NEARBY_PROJECT_COLUMNS, SavedPlacesNotInstalledError, type NearbyProject } from '@/features/nearby/nearby-hooks'
import type { NearbySavedPlace } from '@/types/database'
import { NearbyFinderPage } from './nearby-finder'

let role = 'employee'
let projects: NearbyProject[] = []
let saved: NearbySavedPlace[] = []
let savedError: Error | null = null
const locate = vi.fn()
const savePlace = vi.fn()
const searchPlaces = vi.fn()

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role, organization_id: 'org' }, loading: false }),
}))
vi.mock('@/lib/geo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/geo')>()),
  requestDeviceLocation: (...args: unknown[]) => locate(...args),
}))
vi.mock('@/features/nearby/nearby-hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/nearby/nearby-hooks')>()),
  useNearbyProjects: () => ({ data: projects, isLoading: false }),
  useSavedPlaces: () => ({ data: savedError ? undefined : saved, isLoading: false, isError: Boolean(savedError), error: savedError }),
  useSaveNearbyPlace: () => ({ mutateAsync: savePlace, isPending: false }),
  useArchiveNearbyPlace: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePlacesSearch: () => ({ mutateAsync: searchPlaces, isPending: false }),
  PlacesNotConfiguredError: class PlacesNotConfiguredError extends Error {
    constructor() {
      super('Google Places is not set up yet.')
      this.name = 'PlacesNotConfiguredError'
    }
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))

const JOB = { latitude: 41.0534, longitude: -73.5387 }
const PHONE = { latitude: 41.3083, longitude: -72.9279, accuracyMeters: 30 }

function near(origin: { latitude: number; longitude: number }, miles: number) {
  return { latitude: origin.latitude + miles / 69, longitude: origin.longitude }
}

function savedPlace(over: Partial<NearbySavedPlace> & { miles?: number | null }): NearbySavedPlace {
  const { miles = 1, ...rest } = over
  return {
    id: rest.business_name ?? 'x',
    organization_id: 'org',
    place_type: 'supplier',
    category: 'plumbing',
    business_name: 'Place',
    address: '1 Main St, Stamford, CT',
    ...(miles == null ? { latitude: null, longitude: null } : near(JOB, miles)),
    phone: null,
    website: null,
    note: null,
    is_preferred: false,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...rest,
  }
}

function renderPage(path = '/nearby') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <NearbyFinderPage />
    </MemoryRouter>,
  )
}

const cardNames = () => screen.queryAllByTestId('saved-place').map((card) => within(card).getByRole('heading').textContent)
const card = (name: string) => within(screen.getByRole('article', { name }))
const categoryLabels = () =>
  [...document.querySelectorAll('#nearby-categories > button')]
    .map((button) => button.textContent)
    .filter((label): label is string => Boolean(label) && label !== 'Search Something Specific')

async function categories() {
  const toggle = screen.getByRole('button', { name: 'Search by Category' })
  if (toggle.getAttribute('aria-expanded') === 'false') await userEvent.click(toggle)
  return within(screen.getByRole('region', { name: 'Search by category' }))
}
async function categoryButton(label: string) {
  return (await categories()).getByRole('button', { name: label })
}
function lastPlacesSearch() {
  expect(searchPlaces).toHaveBeenCalled()
  return searchPlaces.mock.calls.at(-1)![0] as {
    query: string
    origin: { latitude: number | null; longitude: number | null; address: string | null }
    radiusMiles: number
  }
}
async function specificInput() {
  const menu = await categories()
  const option = menu.getByRole('button', { name: 'Search Something Specific' })
  if (option.getAttribute('aria-expanded') === 'false') await userEvent.click(option)
  return menu.getByRole('searchbox', { name: 'Search something specific' })
}

beforeEach(() => {
  role = 'employee'
  savedError = null
  sessionStorage.clear()
  locate.mockReset().mockResolvedValue(PHONE)
  savePlace.mockReset().mockResolvedValue({})
  searchPlaces.mockReset().mockResolvedValue([
    {
      id: 'g1',
      name: 'Home Depot Stamford',
      address: '1 Depot Rd',
      latitude: 41.05,
      longitude: -73.54,
      rating: 4.4,
      ratingCount: 200,
      mapsUrl: 'https://maps.google.com/?cid=1',
      phone: '+1 203-555-0100',
      openNow: true,
      distanceMiles: 1.1,
    },
  ])
  projects = [
    {
      id: 'p1',
      name: 'Kim Bathroom Remodel',
      job_site_address: '12 Oak St, Stamford, CT',
      location: null,
      ...JOB,
      location_verification_status: 'verified',
      ...({ current_project_total: 98765 } as object),
    } as NearbyProject,
    { id: 'p2', name: 'Lopez Deck', job_site_address: '48 Elm Ave #2, Norwalk, CT', location: null, latitude: null, longitude: null, location_verification_status: 'unverified' },
  ]
  saved = [
    savedPlace({ business_name: 'Ferguson Plumbing Supply', miles: 3.5, is_preferred: true, phone: '(203) 555-0123', website: 'https://www.ferguson.com/', note: 'Good TracPipe stock. Call Mike.' }),
    savedPlace({ business_name: 'Local Electrical Supply', category: 'electrical', miles: 1.2, phone: '203-555-0177' }),
    savedPlace({ business_name: 'The Home Depot', category: 'home_improvement', miles: 2.8, phone: '(203) 555-0141' }),
    savedPlace({ business_name: 'Shoreline Lumber', category: 'lumber', miles: 12, phone: '(203) 555-0133' }),
    savedPlace({ business_name: 'Corner Safety Supply', category: 'tools', miles: 4, phone: null }),
    savedPlace({ business_name: 'Mi Ecuador Restaurant', place_type: 'food', category: 'ecuadorian', miles: 1.8, is_preferred: true, phone: '(203) 555-0172', note: 'Good Ecuadorian lunch' }),
    savedPlace({ business_name: 'Main Street Deli', place_type: 'food', category: 'deli', miles: 0.9, phone: '(203) 555-0181' }),
  ]
})

describe('screen order: where → category (with specific search inside) → saved', () => {
  it('Search Near, Search by Category, then saved places directly; no standalone manual-search block', () => {
    renderPage()
    const accordion = screen.getByRole('region', { name: 'Search by category' })
    const order = [
      screen.getByRole('group', { name: 'Search near' }),
      accordion,
      screen.getByRole('heading', { name: 'Saved Suppliers Nearby' }),
      screen.getAllByTestId('saved-place')[0],
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const savedSection = screen.getByRole('heading', { name: 'Saved Suppliers Nearby' }).closest('section')
    expect(accordion.nextElementSibling).toBe(savedSection)
    expect(screen.getByRole('heading', { name: 'Search Near' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Search Something Specific/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Search Something Specific')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/Find More on Google Maps/i)).not.toBeInTheDocument()
  })

  it('Search by Category is closed by default and expands into the full category menu', async () => {
    renderPage()
    const toggle = screen.getByRole('button', { name: 'Search by Category' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Plumbing Supply' })).not.toBeInTheDocument()
    const menu = await categories()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(categoryLabels()).toEqual([
      'All Suppliers', 'Plumbing Supply', 'Electrical Supply', 'HVAC Supply', 'Gas / CSST Supply', 'Building Materials', 'Lumber',
      'Roofing Supply', 'Tile Supply', 'Paint', 'Hardware', 'Tools', 'Equipment Rental', 'Home Depot', "Lowe's",
    ])
    const options = [...document.querySelectorAll('#nearby-categories > button')]
    expect(options.at(-1)?.textContent).toBe('Search Something Specific')
    expect(menu.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})

describe('Search by Category: one tap searches Google Places around the project', () => {
  it.each([
    ['Plumbing Supply', 'plumbing supply'],
    ['Electrical Supply', 'electrical supply'],
    ['HVAC Supply', 'HVAC supply'],
    ['Gas / CSST Supply', 'gas pipe CSST supply'],
    ['Home Depot', 'Home Depot'],
    ["Lowe's", "Lowe's"],
  ])('%s is itself the search, around the current project', async (label, term) => {
    renderPage()
    await userEvent.click(await categoryButton(label))
    expect(lastPlacesSearch()).toEqual({
      query: term,
      origin: expect.objectContaining({ latitude: JOB.latitude, longitude: JOB.longitude }),
      radiusMiles: 10,
    })
    expect(await screen.findByRole('heading', { name: 'Home Depot Stamford' })).toBeInTheDocument()
  })

  it.each([
    ['Ecuadorian', 'Ecuadorian restaurant'],
    ['Deli', 'deli'],
    ['Latin Food', 'Latin restaurant'],
    ['Quick Lunch', 'quick lunch'],
  ])('Food: %s searches Places around the project', async (label, term) => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Food' }))
    await userEvent.click(await categoryButton(label))
    expect(lastPlacesSearch().query).toBe(term)
    expect(lastPlacesSearch().origin).toEqual(expect.objectContaining({ latitude: JOB.latitude, longitude: JOB.longitude }))
  })

  it('keeps Google results after leaving Nearby Finder and coming back', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/nearby']}>
        <NearbyFinderPage />
      </MemoryRouter>,
    )
    await userEvent.click(await categoryButton('All Suppliers'))
    expect(await screen.findByRole('heading', { name: 'Home Depot Stamford' })).toBeInTheDocument()
    unmount()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Nearby on Google' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Home Depot Stamford' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search by Category' })).toHaveAttribute('aria-expanded', 'true')
    expect(searchPlaces).toHaveBeenCalledTimes(1)
  })

  it('opens Google Maps when Places is not configured', async () => {
    const { PlacesNotConfiguredError } = await import('@/features/nearby/nearby-hooks')
    searchPlaces.mockRejectedValue(new PlacesNotConfiguredError())
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPage()
    await userEvent.click(await categoryButton('Home Depot'))
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining('maps/search'), '_blank', 'noopener,noreferrer'))
    expect(new URL(open.mock.calls[0][0] as string).searchParams.get('query')).toBe('Home Depot near 41.05340,-73.53870')
    expect(screen.getByRole('heading', { name: /No Google places for Home Depot/ })).toBeInTheDocument()
    open.mockRestore()
  })

  it('Food lists Ecuadorian / Latin / Hispanic first', async () => {
    renderPage('/nearby?mode=food')
    await categories()
    const labels = categoryLabels()
    expect(labels.slice(0, 3)).toEqual(['Ecuadorian', 'Latin Food', 'Hispanic Food'])
    expect(labels).toEqual(['Ecuadorian', 'Latin Food', 'Hispanic Food', 'Deli', 'Quick Lunch', 'Bakery', 'Breakfast', 'Coffee', 'Tacos', 'Restaurants'])
  })
})

describe('Search Something Specific (inside Search by Category)', () => {
  it('is the last option; tapping it reveals the input instead of opening Google Maps', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPage()
    const menu = await categories()
    const option = menu.getByRole('button', { name: 'Search Something Specific' })
    expect(option).toHaveAttribute('aria-expanded', 'false')
    expect(menu.queryByRole('searchbox')).not.toBeInTheDocument()
    await userEvent.click(option)
    expect(option).toHaveAttribute('aria-expanded', 'true')
    expect(menu.getByPlaceholderText('TracPipe, ProPEX, breaker...')).toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()
    await userEvent.click(option)
    expect(menu.queryByRole('searchbox')).not.toBeInTheDocument()
    open.mockRestore()
  })

  it('searches Places with the typed term around the selected location', async () => {
    renderPage()
    await userEvent.type(await specificInput(), '3/4 TracPipe fitting{Enter}')
    expect(lastPlacesSearch().query).toBe('3/4 TracPipe fitting')
    expect(lastPlacesSearch().origin).toEqual(expect.objectContaining({ latitude: JOB.latitude, longitude: JOB.longitude }))
    expect(screen.getByText('Call to confirm availability.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Home Depot Stamford' })).toBeInTheDocument()
  })

  it('does nothing until something is typed; Food uses a food hint', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPage('/nearby?mode=food')
    await specificInput()
    expect(screen.getByPlaceholderText('Ceviche, empanadas, subs...')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Search by category' })).getByRole('button', { name: 'Search' })).toBeDisabled()
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('hides again when the accordion closes', async () => {
    renderPage()
    await specificInput()
    await userEvent.click(screen.getByRole('button', { name: 'Search by Category' }))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Search Something Specific')).not.toBeInTheDocument()
  })
})

describe('Search Near', () => {
  it('Current Project is the default; saved suppliers near it, Preferred first', () => {
    renderPage()
    expect(within(screen.getByRole('group', { name: 'Search near' })).getByRole('button', { name: 'Current Project' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('p1')
    expect(cardNames()).toEqual(['Ferguson Plumbing Supply', 'Local Electrical Supply', 'The Home Depot'])
    expect(card('Ferguson Plumbing Supply').getByText('Tamay Preferred')).toBeInTheDocument()
    expect(card('Ferguson Plumbing Supply').getByText('3.5 mi')).toBeInTheDocument()
    expect(screen.getByText('Call to confirm before driving.')).toBeInTheDocument()
    expect(locate).not.toHaveBeenCalled()
  })

  it('the Project Detail shortcut (?project=) preselects that project; unverified coordinates fall back to the address', async () => {
    renderPage('/nearby?project=p2')
    expect(within(screen.getByRole('group', { name: 'Search near' })).getByRole('button', { name: 'Current Project' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('p2')
    await userEvent.click(await categoryButton('Plumbing Supply'))
    expect(lastPlacesSearch().query).toBe('plumbing supply')
    expect(lastPlacesSearch().origin).toEqual(expect.objectContaining({ address: '48 Elm Ave #2, Norwalk, CT', latitude: null, longitude: null }))
    expect(screen.queryByRole('group', { name: 'Distance' })).not.toBeInTheDocument()
    expect(screen.getByText(/Distances need verified project coordinates/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /See 2 more/ }))
    expect(cardNames()).toHaveLength(5)
  })

  it('Current Location uses the device position for categories, specific search and distances', async () => {
    renderPage()
    await userEvent.click(within(screen.getByRole('group', { name: 'Search near' })).getByRole('button', { name: 'Current Location' }))
    await waitFor(() => expect(locate).toHaveBeenCalled())
    await waitFor(() => expect(screen.getAllByText(/your current location/i).length).toBeGreaterThan(0))
    await userEvent.click(await categoryButton('Plumbing Supply'))
    expect(lastPlacesSearch().origin).toEqual(expect.objectContaining({ latitude: PHONE.latitude, longitude: PHONE.longitude }))
    expect(locate).toHaveBeenCalledTimes(1)
    await userEvent.type(await specificInput(), 'ProPEX{Enter}')
    expect(lastPlacesSearch().query).toBe('ProPEX')
    expect(lastPlacesSearch().origin).toEqual(expect.objectContaining({ latitude: PHONE.latitude, longitude: PHONE.longitude }))
  })

  it('denied location keeps the finder working and offers Project or Enter Location', async () => {
    locate.mockRejectedValue(new Error('denied'))
    renderPage()
    await userEvent.click(within(screen.getByRole('group', { name: 'Search near' })).getByRole('button', { name: 'Current Location' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Location unavailable. Choose a project or enter an address.')
    expect(within(alert).getByRole('button', { name: 'Enter Location' })).toBeInTheDocument()
    await userEvent.click(within(alert).getByRole('button', { name: 'Use a Project' }))
    await userEvent.click(await categoryButton('Plumbing Supply'))
    expect(lastPlacesSearch().origin).toEqual(expect.objectContaining({ latitude: JOB.latitude, longitude: JOB.longitude }))
  })

  it('Enter Location passes the typed address to Places (no geocoding)', async () => {
    renderPage()
    await userEvent.click(within(screen.getByRole('group', { name: 'Search near' })).getByRole('button', { name: 'Enter Location' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Location' }), "200 O'Neil Rd & Main, Bridgeport")
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    await userEvent.click(await categoryButton('Lumber'))
    expect(lastPlacesSearch()).toEqual({
      query: 'lumber yard',
      origin: expect.objectContaining({ address: "200 O'Neil Rd & Main, Bridgeport", latitude: null, longitude: null }),
      radiusMiles: 10,
    })
    expect(locate).not.toHaveBeenCalled()
  })

  it('loads only location fields and never shows project finance', () => {
    renderPage()
    expect(NEARBY_PROJECT_COLUMNS).not.toMatch(/total|finance|price|amount|contract|notes|client/)
    expect(document.body.textContent).not.toMatch(/98,?765|\$/)
  })
})

describe('Saved Nearby (below the searches, cards unchanged)', () => {
  it('Food shows Crew Favorites Nearby', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByRole('heading', { name: 'Crew Favorites Nearby' })).toBeInTheDocument()
    expect(cardNames()).toEqual(['Mi Ecuador Restaurant', 'Main Street Deli'])
    expect(card('Mi Ecuador Restaurant').getByText('Crew Favorite')).toBeInTheDocument()
  })

  it('Call, Directions and an optional Website; no website means no empty action', () => {
    renderPage()
    const ferguson = card('Ferguson Plumbing Supply')
    expect(ferguson.getByRole('link', { name: 'Call Ferguson Plumbing Supply' })).toHaveAttribute('href', 'tel:+12035550123')
    expect(ferguson.getByRole('link', { name: 'Directions to Ferguson Plumbing Supply' }).getAttribute('href')).toMatch(
      /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=41\.\d+,-73\.\d+$/,
    )
    expect(ferguson.getByRole('link', { name: 'Website for Ferguson Plumbing Supply' })).toHaveAttribute('href', 'https://www.ferguson.com/')
    const electric = card('Local Electrical Supply')
    expect(electric.queryByRole('link', { name: /Website/ })).not.toBeInTheDocument()
    expect(electric.getByText('(203) 555-0177')).toBeInTheDocument()
  })

  it('no phone: Call is disabled, never a broken link', async () => {
    renderPage()
    await userEvent.click(within(screen.getByRole('group', { name: 'Distance' })).getByRole('button', { name: '5 mi' }))
    await userEvent.click(screen.getByRole('button', { name: /See 1 more/ }))
    const safety = card('Corner Safety Supply')
    expect(safety.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument()
    expect(safety.getByText('No phone').closest('[aria-disabled="true"]')).not.toBeNull()
  })

  it('Details stay closed until opened; employees get no edit controls', async () => {
    renderPage()
    const ferguson = card('Ferguson Plumbing Supply')
    const toggle = ferguson.getByRole('button', { name: 'Details' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(ferguson.queryByText(/Call Mike/)).not.toBeInTheDocument()
    await userEvent.click(toggle)
    expect(ferguson.getByText(/Good TracPipe stock. Call Mike./)).toBeInTheDocument()
    expect(ferguson.getByRole('link', { name: 'Open in Waze' })).toHaveAttribute('href', expect.stringContaining('waze.com/ul?ll='))
    expect(ferguson.queryByRole('button', { name: /Edit|Archive/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Place' })).not.toBeInTheDocument()
  })

  it('radius filters saved places and offers to expand when none are close', async () => {
    renderPage()
    expect(cardNames()).not.toContain('Shoreline Lumber')
    await userEvent.click(within(screen.getByRole('group', { name: 'Distance' })).getByRole('button', { name: '15 mi' }))
    await userEvent.click(screen.getByRole('button', { name: /See \d more/ }))
    expect(cardNames()).toContain('Shoreline Lumber')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Saved category' }), 'lumber')
    await userEvent.click(within(screen.getByRole('group', { name: 'Distance' })).getByRole('button', { name: '5 mi' }))
    expect(screen.getByText('No saved suppliers within 5 miles yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expand to 10 miles' }))
    expect(screen.getByText('No saved suppliers within 10 miles yet.')).toBeInTheDocument()
  })
})

describe('management', () => {
  it('sees Save Place and per-place Edit / Archive', async () => {
    role = 'project_manager'
    renderPage()
    expect(screen.getByRole('button', { name: 'Save Place' })).toBeInTheDocument()
    await userEvent.click(card('Ferguson Plumbing Supply').getByRole('button', { name: 'Details' }))
    expect(card('Ferguson Plumbing Supply').getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(card('Ferguson Plumbing Supply').getByRole('button', { name: 'Archive' })).toBeInTheDocument()
  })

  it('after a Plumbing Supply search, Save Place defaults to Supplier / Plumbing Supply', async () => {
    role = 'admin'
    renderPage()
    await userEvent.click(await categoryButton('Plumbing Supply'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Place' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Supplier' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog.getByLabelText('Category *')).toHaveValue('plumbing')
  })

  it('after a Home Depot search, Save Place files it under Home Improvement; the choice survives a return visit', async () => {
    role = 'admin'
    renderPage()
    await userEvent.click(await categoryButton('Home Depot'))
    const stored = JSON.parse(sessionStorage.getItem('tamay.nearby-finder') ?? '{}')
    expect(stored.lastSearch).toEqual({ mode: 'suppliers', category: 'home_depot' })
    expect(JSON.stringify(stored)).not.toMatch(/41\.|73\.|Oak St|latitude/)
    await userEvent.click(screen.getByRole('button', { name: 'Save Place' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('Category *')).toHaveValue('home_improvement')
  })

  it('after a typed search, Save Place keeps Supplier but asks for the category instead of guessing', async () => {
    role = 'admin'
    renderPage()
    await userEvent.click(await categoryButton('Plumbing Supply'))
    await userEvent.type(await specificInput(), 'TracPipe{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save Place' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Supplier' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog.getByLabelText('Category *')).toHaveValue('')
    await userEvent.type(dialog.getByLabelText('Name *'), 'Shoreline Gas & Pipe')
    await userEvent.type(dialog.getByLabelText('Address *'), '45 Industrial Rd, Branford, CT')
    await userEvent.click(dialog.getByRole('button', { name: 'Save Place' }))
    expect(dialog.getByText('Choose a category.')).toBeInTheDocument()
    expect(savePlace).not.toHaveBeenCalled()
  })

  it('saves a place from the quick form: required fields, optional website, preferred flag', async () => {
    role = 'admin'
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Save Place' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Save Place' }))
    expect(dialog.getByText('Enter the business name.')).toBeInTheDocument()
    expect(dialog.getByText('Enter the address.')).toBeInTheDocument()
    expect(savePlace).not.toHaveBeenCalled()
    await userEvent.type(dialog.getByLabelText('Name *'), 'Shoreline Gas & Pipe')
    await userEvent.selectOptions(dialog.getByLabelText('Category *'), 'gas')
    await userEvent.type(dialog.getByLabelText('Address *'), '45 Industrial Rd, Branford, CT')
    await userEvent.type(dialog.getByLabelText('Phone'), '203 555 0110')
    await userEvent.type(dialog.getByLabelText('Internal note'), 'Contractor counter in back')
    await userEvent.click(dialog.getByLabelText(/Mark as Tamay Preferred/))
    await userEvent.click(dialog.getByRole('button', { name: 'Save Place' }))
    await waitFor(() =>
      expect(savePlace).toHaveBeenCalledWith({
        id: undefined,
        value: expect.objectContaining({
          place_type: 'supplier',
          category: 'gas',
          business_name: 'Shoreline Gas & Pipe',
          address: '45 Industrial Rd, Branford, CT',
          phone: '203 555 0110',
          website: null,
          note: 'Contractor counter in back',
          is_preferred: true,
        }),
      }),
    )
  })

  it('a pasted Google Maps link fills the name and map location (nothing is fetched)', async () => {
    role = 'admin'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Save Place' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByLabelText(/Google Maps link/))
    await userEvent.paste('https://www.google.com/maps/place/Ferguson+Plumbing+Supply,+1790+State+St,+New+Haven/@41.32,-72.91,17z/data=!3d41.3256!4d-72.9104')
    expect(dialog.getByLabelText('Name *')).toHaveValue('Ferguson Plumbing Supply')
    expect(dialog.getByLabelText('Address *')).toHaveValue('1790 State St, New Haven')
    expect(dialog.getByText('Map location set: distance will show.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('before the migration is applied, management sees a setup message and category search still works', async () => {
    role = 'admin'
    savedError = new SavedPlacesNotInstalledError()
    renderPage()
    expect(screen.getByText('Saved places are not set up in this database yet.')).toBeInTheDocument()
    await userEvent.click(await categoryButton('Plumbing Supply'))
    expect(lastPlacesSearch().query).toBe('plumbing supply')
  })
})

describe('privacy, layout and access', () => {
  it('remembers mode and location choice for the session, never coordinates or addresses', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Food' }))
    const stored = sessionStorage.getItem('tamay.nearby-finder') ?? ''
    expect(JSON.parse(stored)).toEqual({ mode: 'food', originKind: 'project', projectId: 'p1', radius: 10, lastSearch: null })
    expect(stored).not.toMatch(/41\.|73\.|Oak St|latitude/)
    expect(sessionStorage.getItem('tamay.nearby-finder.places')).toBeNull()
  })

  it('compact phone layout: three location buttons with Current Project first, categories folded away', () => {
    renderPage()
    const buttons = within(screen.getByRole('group', { name: 'Search near' })).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Current Project', 'Current Location', 'Enter Location'])
    expect(screen.getByRole('button', { name: 'Search by Category' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('region', { name: 'Search by category' })).queryAllByRole('link')).toHaveLength(0)
  })

  it('staff can use it, only management can manage saved places, clients are sent to the portal', () => {
    expect(['admin', 'project_manager', 'employee', 'subcontractor'].every((r) => canUseNearbyFinder(r as never))).toBe(true)
    expect(canUseNearbyFinder('client')).toBe(false)
    expect(canManageSavedPlaces('admin')).toBe(true)
    expect(canManageSavedPlaces('project_manager')).toBe(true)
    expect(canManageSavedPlaces('employee')).toBe(false)
    expect(canManageSavedPlaces('subcontractor')).toBe(false)
    role = 'client'
    render(
      <MemoryRouter initialEntries={['/nearby']}>
        <Routes>
          <Route element={<StaffRoute />}>
            <Route path="/nearby" element={<p>finder</p>} />
          </Route>
          <Route path="/portal" element={<p>client portal</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('client portal')).toBeInTheDocument()
  })
})
