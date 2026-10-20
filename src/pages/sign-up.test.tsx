import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SignUpPage, SubcontractorSignUpPage } from './sign-up'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: vi.fn(), signOut: vi.fn() } },
}))

describe('staff sign-up forms', () => {
  it('employee form has no role picker or company fields', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Register as an employee. Approval is required.')).toBeInTheDocument()
    expect(screen.queryByText('Role')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Subcontractor sign up' })).toHaveAttribute(
      'href',
      '/sign-up/subcontractor',
    )
  })

  it('subcontractor form shows company fields and no role picker', () => {
    render(
      <MemoryRouter>
        <SubcontractorSignUpPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Register as a subcontractor. Approval is required.')).toBeInTheDocument()
    expect(screen.queryByText('Role')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Company name')).toBeInTheDocument()
    expect(screen.getByLabelText('Trade specialization')).toBeInTheDocument()
  })
})
