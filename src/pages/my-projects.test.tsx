import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyProjectsPage } from './my-projects'
import type { MyProjectView } from '@/features/projects/my-projects-model'
import type { ProjectNoteSnippet } from '@/features/projects/my-projects-hooks'
import type { MyWorkScheduleItem, Project } from '@/types/database'

let role = 'employee'
let views: MyProjectView[] = []
let notes = new Map<string, ProjectNoteSnippet[]>()
const coverUrl = vi.fn()

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role, organization_id: 'org' } }),
}))
vi.mock('@/features/projects/my-projects-hooks', () => ({
  useMyProjectsData: () => ({ views, notesByProject: notes, isLoading: false, isError: false }),
  useProjectCoverUrl: (cover: unknown) => ({ data: cover ? coverUrl() : undefined }),
}))

const project = (over: Partial<Project>) =>
  ({
    id: 'p1',
    name: 'Kim Bathroom',
    description: 'Full bathroom remodel',
    location: null,
    job_site_address: '12 Oak St, Stamford CT',
    latitude: null,
    longitude: null,
    status: 'in_progress',
    start_date: '2026-09-14',
    deadline: '2026-11-20',
    updated_at: '2026-10-01T10:00:00Z',
    ...over,
  }) as Project

const visit = (over: Partial<MyWorkScheduleItem>) =>
  ({
    entry_id: 'v1',
    project_id: 'p1',
    work_date: '2099-10-06',
    start_time: '08:00:00',
    end_time: '12:00:00',
    task: 'Set shower pan and tile walls',
    notes: 'Bring grout sealer',
    crew: ['Luis Ortega', 'Dan Reyes'],
    ...over,
  }) as MyWorkScheduleItem

function seed() {
  views = [
    {
      project: project({}),
      address: '12 Oak St, Stamford CT',
      visits: [visit({}), visit({ entry_id: 'v2', work_date: '2099-10-09', start_time: '13:00:00', end_time: '16:00:00' })],
      client: { name: 'Ana Kim', phone: '(203) 555-1234' },
      photos: {
        count: 5,
        cover: { id: 'ph1', project_id: 'p1', category: 'work_photo', mime_type: 'image/jpeg', storage_path: 'a.jpg', created_at: '2026-10-01', name: 'kitchen.jpg' },
        coverSource: 'explicit',
      },
    },
    {
      project: project({ id: 'p2', name: 'Lopez Deck', status: 'waiting', job_site_address: '4 Elm Ave, Norwalk' }),
      address: '4 Elm Ave, Norwalk',
      visits: [],
      client: null,
      photos: { count: 0, cover: null, coverSource: null },
    },
    {
      project: project({ id: 'p3', name: 'Shore Kitchen', status: 'completed', job_site_address: null }),
      address: null,
      visits: [],
      client: { name: 'Sam Shore', phone: null },
      photos: { count: 0, cover: null, coverSource: null },
    },
    {
      project: project({ id: 'p4', name: 'Patel Basement', status: 'not_started', job_site_address: '8 Pine Rd, Darien' }),
      address: '8 Pine Rd, Darien',
      visits: [],
      client: null,
      photos: { count: 0, cover: null, coverSource: null },
    },
  ]
  notes = new Map([
    [
      'p1',
      [
        {
          id: 'n1',
          project_id: 'p1',
          content: 'Waterproofing passed inspection',
          photo_path: null,
          created_at: '2026-10-02T15:00:00Z',
          author: { first_name: 'Luis', last_name: 'Ortega' },
        },
      ],
    ],
  ])
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyProjectsPage />
    </MemoryRouter>,
  )
}

function firstCard() {
  return screen.getAllByTestId('my-project-card')[0]
}

function detailsPanel(card: HTMLElement) {
  const toggle = within(card).getByRole('button', { name: 'View details' })
  return { toggle, panel: document.getElementById(toggle.getAttribute('aria-controls')!)! }
}

beforeEach(() => {
  role = 'employee'
  coverUrl.mockReturnValue('https://signed.example/cover.jpg')
  seed()
})

describe('My Projects (employee)', () => {
  it('header, search, sort and status pills with counts', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'My Projects' })).toBeInTheDocument()
    expect(screen.getByText('4 assigned projects')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search projects, clients, or addresses…')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('next_visit')
    expect(screen.getByRole('combobox', { name: 'Sort projects' })).toHaveValue('next_visit')
    const pills = within(screen.getByRole('group', { name: 'Filter by status' }))
    expect(pills.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'All (4)',
      'Open (1)',
      'In Progress (1)',
      'Waiting (1)',
      'Completed (1)',
    ])
    expect(pills.getByRole('button', { name: 'All (4)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Not Started/i)).not.toBeInTheDocument()
  })

  it('"Open" filter shows not-started projects, labelled Open', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Open (1)' }))
    const cards = screen.getAllByTestId('my-project-card')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]).getByText('Patel Basement')).toBeInTheDocument()
    expect(within(cards[0]).getAllByTestId('status-pill').map((p) => p.textContent)).toEqual(['Open', 'Open'])
  })

  it('status filter and search narrow the cards', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Waiting (1)' }))
    expect(screen.getAllByTestId('my-project-card')).toHaveLength(1)
    expect(screen.getByText('Lopez Deck')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'All (4)' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ana kim' } })
    expect(screen.getAllByTestId('my-project-card')).toHaveLength(1)
    expect(screen.getByText('Kim Bathroom')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('No projects match')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }))
    expect(screen.getAllByTestId('my-project-card')).toHaveLength(4)
  })

  it('mobile header: search is an icon that expands; sort is a compact control', () => {
    renderPage()
    const searchRow = screen.getByTestId('search-row')
    expect(searchRow).toHaveClass('hidden', 'md:block')
    fireEvent.click(screen.getByRole('button', { name: 'Search projects' }))
    expect(searchRow).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Close search' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort projects' }), { target: { value: 'name' } })
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('name')
  })

  it('desktop: one vertical list of horizontal cards (photo left, info + actions right)', () => {
    renderPage()
    const list = screen.getByTestId('my-projects-list')
    expect(list.className).toMatch(/flex-col/)
    expect(list.className).not.toMatch(/grid-cols/)
    const card = firstCard()
    expect(card).toHaveClass('lg:grid')
    const [photo, info, toggleRow, details] = Array.from(card.children) as HTMLElement[]
    expect(photo).toHaveAttribute('data-testid', 'card-photo')
    expect(photo).toHaveClass('lg:col-start-1', 'lg:row-start-1')
    expect(info).toHaveAttribute('data-testid', 'card-info')
    expect(info).toHaveClass('lg:col-start-2', 'lg:row-start-1')
    expect(within(info).getByTestId('card-actions')).toBeInTheDocument()
    expect(toggleRow).toHaveClass('lg:col-start-2', 'lg:row-start-2')
    expect(within(toggleRow).getByRole('button', { name: 'View details' })).toBeInTheDocument()
    expect(details).toHaveAttribute('data-testid', 'card-details')
    expect(details).toHaveClass('lg:col-start-2', 'lg:row-start-3')
  })

  it('opening details grows the information column only; the photo keeps its fixed thumbnail size', () => {
    renderPage()
    const card = firstCard()
    const photo = within(card).getByTestId('card-photo')
    fireEvent.click(within(card).getByRole('button', { name: 'View details' }))
    expect(photo.className).not.toMatch(/row-span|row-end/)
    expect(photo).toHaveClass('lg:row-start-1', 'lg:self-start')
    const cover = within(photo).getByRole('img', { name: /Kim Bathroom/ }).parentElement!
    expect(cover).toHaveClass('aspect-[16/9]', 'lg:aspect-[4/3]')
  })

  it('mobile: status sits beside the inset photo; desktop: status on the title row', () => {
    renderPage()
    const card = firstCard()
    const [mobilePill, desktopPill] = within(card).getAllByTestId('status-pill')
    expect(within(card).getByTestId('card-photo').contains(mobilePill)).toBe(true)
    expect(mobilePill).toHaveClass('lg:hidden')
    expect(within(card).getByTestId('card-info').contains(desktopPill)).toBe(true)
    expect(desktopPill).toHaveClass('hidden', 'lg:inline-flex')
  })

  it('desktop info block and action row use the full width of the information column', () => {
    renderPage()
    const card = firstCard()
    const info = within(card).getByText('Next Visit').closest('div.grid') as HTMLElement
    expect(info.className).not.toMatch(/max-w-/)
    const actions = within(card).getByTestId('card-actions')
    for (const action of within(actions).getAllByRole('link')) {
      expect(action.className).not.toMatch(/lg:flex-none/)
    }
  })

  it('closed card shows photo + count, status, name, address, next visit, client, phone and the three actions', () => {
    renderPage()
    const card = firstCard()
    const { panel } = detailsPanel(card)
    const outside = (el: HTMLElement) => expect(panel.contains(el)).toBe(false)
    const c = within(card)
    outside(c.getByRole('img', { name: /Kim Bathroom/ }))
    expect(c.getByRole('img', { name: /Kim Bathroom/ })).toHaveAttribute('src', 'https://signed.example/cover.jpg')
    outside(c.getByLabelText('5 project photos'))
    expect(c.getAllByTestId('status-pill')[0]).toHaveTextContent('In Progress')
    outside(c.getByRole('heading', { level: 2, name: 'Kim Bathroom' }))
    outside(c.getByText('12 Oak St, Stamford CT'))
    outside(c.getByText('8:00 AM – 12:00 PM'))
    outside(c.getByText('Ana Kim'))
    outside(c.getByRole('link', { name: '(203) 555-1234' }))
    const actions = within(c.getByTestId('card-actions'))
    expect(actions.getAllByRole('link').map((l) => l.textContent)).toEqual(['Directions', 'Call', 'Open Project'])
    expect(actions.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', expect.stringContaining('google.com/maps/dir'))
    expect(actions.getByRole('link', { name: 'Call Ana Kim' })).toHaveAttribute('href', 'tel:+12035551234')
    expect(actions.getByRole('link', { name: /Open Project/ })).toHaveAttribute('href', '/projects/p1')
  })

  it('secondary information lives only inside the closed-by-default accordion', () => {
    renderPage()
    const card = firstCard()
    const { toggle, panel } = detailsPanel(card)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).toHaveClass('hidden')
    expect(panel).not.toHaveClass('lg:block')
    for (const text of [
      'Full bathroom remodel',
      'Set shower pan and tile walls',
      'Bring grout sealer',
      'Luis Ortega, Dan Reyes',
      'Future visits',
      'Sep 14, 2026',
      'Nov 20, 2026',
      'Waterproofing passed inspection',
    ]) {
      const matches = within(card).getAllByText(text)
      expect(matches.every((el) => panel.contains(el)), text).toBe(true)
    }
    expect(within(panel).queryByRole('button', { name: /show more|view details/i })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(panel).not.toHaveClass('hidden')
  })

  it('no photo: branded fallback, no count; missing address / phone disable those actions', () => {
    renderPage()
    const card = (name: string) =>
      within(screen.getAllByTestId('my-project-card').find((el) => el.textContent?.includes(name))!)
    const deck = card('Lopez Deck')
    expect(deck.getByText('LD')).toBeInTheDocument()
    expect(deck.getByText('No photos yet')).toBeInTheDocument()
    expect(deck.queryByLabelText(/project photo/)).not.toBeInTheDocument()
    expect(deck.getByText('No contact on file')).toBeInTheDocument()
    expect(deck.getByRole('button', { name: /Call/ })).toBeDisabled()
    const kitchen = card('Shore Kitchen')
    expect(kitchen.getByRole('button', { name: /Directions/ })).toBeDisabled()
  })

  it('never renders project totals or finance, even if the project row carries them', () => {
    views[0] = {
      ...views[0],
      project: { ...views[0].project, original_project_total: 48250, current_project_total: 51900 } as Project,
    }
    renderPage()
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'View details' }))
    for (const text of [/48,?250/, /51,?900/, /\$/, /total/i, /Financial/i, /Breakdown/i, /contract/i, /estimate/i]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  it('no management controls on the employee page', () => {
    renderPage()
    for (const text of [/New project/i, /Archive/i, /Delete/i, /Restore/i]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })
})

describe('My Projects (subcontractor)', () => {
  it('keeps the existing rule: no client contact or Call button', () => {
    role = 'subcontractor'
    renderPage()
    const card = within(firstCard())
    expect(card.queryByText(/Primary client/i)).not.toBeInTheDocument()
    expect(card.queryByText('Ana Kim')).not.toBeInTheDocument()
    expect(card.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument()
    const actions = within(card.getByTestId('card-actions'))
    expect(actions.getAllByRole('link').map((l) => l.textContent)).toEqual(['Directions', 'Open Project'])
  })
})
