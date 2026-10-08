import { describe, expect, it } from 'vitest'
import { accountChangeReason, workforceAdminActions } from './admin-actions'

describe('workforceAdminActions', () => {
  it('lets an admin clock out, deactivate, and remove someone else', () => {
    const actions = workforceAdminActions({
      viewerRole: 'admin',
      viewerId: 'admin-1',
      workerId: 'worker-1',
      isActive: true,
    })
    expect(actions).toEqual({
      canClockOut: true,
      canDeactivate: true,
      canRemove: true,
      canHireBack: false,
    })
  })

  it('lets a project manager clock out but not fire or deactivate', () => {
    const actions = workforceAdminActions({
      viewerRole: 'project_manager',
      viewerId: 'pm-1',
      workerId: 'worker-1',
      isActive: true,
    })
    expect(actions.canClockOut).toBe(true)
    expect(actions.canRemove).toBe(false)
    expect(actions.canDeactivate).toBe(false)
  })

  it('blocks an admin from removing their own account', () => {
    const actions = workforceAdminActions({
      viewerRole: 'admin',
      viewerId: 'admin-1',
      workerId: 'admin-1',
      isActive: true,
    })
    expect(actions.canRemove).toBe(false)
    expect(actions.canDeactivate).toBe(false)
  })

  it('offers hire-back only when the worker is inactive', () => {
    const actions = workforceAdminActions({
      viewerRole: 'admin',
      viewerId: 'admin-1',
      workerId: 'worker-1',
      isActive: false,
    })
    expect(actions.canHireBack).toBe(true)
    expect(actions.canDeactivate).toBe(false)
  })

  it('uses a typed reason, or a dashboard default so Deactivate and Remove still run', () => {
    expect(accountChangeReason('Safety hold', 'Deactivated from Workforce status')).toBe('Safety hold')
    expect(accountChangeReason('  ', 'Removed from Workforce status')).toBe('Removed from Workforce status')
  })
})
