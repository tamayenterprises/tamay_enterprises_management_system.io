import { describe, expect, it } from 'vitest'
import { canManageProfileField, profileUpdatePayload } from './profile-fields'

const formValues = {
  first_name: 'Ana',
  last_name: 'Kim',
  phone: '203-555-0100',
  insurance_info: 'GL',
  license_info: 'HIC',
  hire_date: null,
  emergency_contact_name: '',
  emergency_contact_phone: '',
  internal_notes: '',
  is_active: true,
}

describe('profile private fields', () => {
  it('lets project managers manage only email, phone, insurance and license', () => {
    expect(canManageProfileField('project_manager', 'phone')).toBe(true)
    expect(canManageProfileField('project_manager', 'insurance_info')).toBe(true)
    for (const field of ['hire_date', 'emergency_contact_name', 'emergency_contact_phone', 'internal_notes'] as const) {
      expect(canManageProfileField('project_manager', field)).toBe(false)
      expect(canManageProfileField('admin', field)).toBe(true)
    }
    expect(canManageProfileField('employee', 'phone')).toBe(false)
    expect(canManageProfileField('client', 'email')).toBe(false)
  })

  it('omits hidden fields from a project manager update instead of sending blanks', () => {
    const payload = profileUpdatePayload(formValues, 'project_manager')
    expect(payload).toEqual({
      first_name: 'Ana',
      last_name: 'Kim',
      phone: '203-555-0100',
      insurance_info: 'GL',
      license_info: 'HIC',
      is_active: true,
    })
  })

  it('keeps every field for an admin update', () => {
    expect(profileUpdatePayload(formValues, 'admin')).toEqual(formValues)
  })

  it('sends no private fields for anyone else', () => {
    expect(profileUpdatePayload(formValues, 'employee')).toEqual({ first_name: 'Ana', last_name: 'Kim', is_active: true })
  })
})
