import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SignInPage } from './sign-in'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: vi.fn() }, from: vi.fn() },
}))

describe('sign-in account links', () => {
  it('offers separate employee and subcontractor sign-up links', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Staff / employee' })).toHaveAttribute('href', '/sign-up')
    expect(screen.getByRole('link', { name: 'Subcontractors' })).toHaveAttribute(
      'href',
      '/sign-up/subcontractor',
    )
  })
})
