import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FindNearbyLink } from './find-nearby-link'

const project: {
  id: string
  archived_at: string | null
  job_site_address: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
} = {
  id: 'p1',
  archived_at: null,
  job_site_address: '12 Oak St, Stamford, CT',
  location: null,
  latitude: 41.05,
  longitude: -73.54,
}

function renderLink(over: Partial<typeof project> = {}, role: string | null = 'employee') {
  return render(
    <MemoryRouter>
      <FindNearbyLink project={{ ...project, ...over }} role={role as never} />
    </MemoryRouter>,
  )
}

describe('Project Detail → Find Nearby', () => {
  it.each(['admin', 'project_manager', 'employee', 'subcontractor'])('%s gets a link centred on the job site', (role) => {
    renderLink({}, role)
    expect(screen.getByRole('link', { name: 'Find Nearby' })).toHaveAttribute('href', '/nearby?project=p1')
  })

  it('clients, archived projects and projects with no location get no link', () => {
    const { unmount } = renderLink({}, 'client')
    expect(screen.queryByRole('link', { name: 'Find Nearby' })).not.toBeInTheDocument()
    unmount()
    renderLink({ archived_at: '2026-10-01T00:00:00Z' })
    expect(screen.queryByRole('link', { name: 'Find Nearby' })).not.toBeInTheDocument()
  })

  it('needs an address or coordinates', () => {
    renderLink({ job_site_address: null, latitude: null, longitude: null })
    expect(screen.queryByRole('link', { name: 'Find Nearby' })).not.toBeInTheDocument()
  })

  it('an address alone is enough (Nearby Finder geocodes it)', () => {
    renderLink({ latitude: null, longitude: null })
    expect(screen.getByRole('link', { name: 'Find Nearby' })).toBeInTheDocument()
  })
})
