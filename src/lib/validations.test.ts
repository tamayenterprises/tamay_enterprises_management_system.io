import { describe, expect, it } from 'vitest'
import { signInSchema, signUpSchema } from '@/lib/validations'

describe('auth validations', () => {
  it('accepts valid sign-in payloads', () => {
    const result = signInSchema.safeParse({
      email: 'ops@tamayenterprises.com',
      password: 'securepass',
    })
    expect(result.success).toBe(true)
  })

  it('requires matching passwords on sign-up', () => {
    const result = signUpSchema.safeParse({
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan@example.com',
      phone: '555-0100',
      password: 'securepass',
      confirmPassword: 'different',
      role: 'employee',
    })
    expect(result.success).toBe(false)
  })

  it('requires company name for subcontractors', () => {
    const result = signUpSchema.safeParse({
      firstName: 'Sam',
      lastName: 'Rivera',
      email: 'sam@example.com',
      phone: '555-0199',
      password: 'securepass',
      confirmPassword: 'securepass',
      role: 'subcontractor',
      companyName: '',
    })
    expect(result.success).toBe(false)
  })
})
