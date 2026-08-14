import type { Profile } from '@/types/database'

export type WorkerDerivedStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED' | 'ARCHIVED' | 'TERMINATED'

export type WorkerEligibility = {
  worker_id: string
  found: boolean
  derived_status: WorkerDerivedStatus
  authentication_account_exists?: boolean
  can_authenticate: boolean
  can_access_company_application: boolean
  can_access_assigned_projects: boolean
  active_project_assignments?: number
  can_submit_attendance: boolean
  can_submit_exception_request: boolean
  can_be_administratively_corrected: boolean
  blocking_reason: string | null
  required_administrative_action: string | null
  profile?: {
    approval_status: string
    is_active: boolean
    archived_at: string | null
    role: string
    email: string
    first_name: string
    last_name: string
    organization_id: string | null
    updated_at: string
  } | null
}

/** Client-side mirror of get_worker_eligibility when RPC is unavailable. */
export function deriveWorkerEligibility(profile: Profile | null | undefined, assignmentCount = 0): WorkerEligibility {
  if (!profile) {
    return {
      worker_id: '',
      found: false,
      derived_status: 'INACTIVE',
      can_authenticate: false,
      can_access_company_application: false,
      can_access_assigned_projects: false,
      can_submit_attendance: false,
      can_submit_exception_request: false,
      can_be_administratively_corrected: false,
      blocking_reason: 'Worker profile was not found.',
      required_administrative_action: 'Create or restore the worker profile.',
      profile: null,
    }
  }

  if (profile.archived_at) {
    return {
      worker_id: profile.id,
      found: true,
      derived_status: 'ARCHIVED',
      can_authenticate: true,
      can_access_company_application: false,
      can_access_assigned_projects: false,
      active_project_assignments: assignmentCount,
      can_submit_attendance: false,
      can_submit_exception_request: false,
      can_be_administratively_corrected: true,
      blocking_reason: 'Worker profile is archived and cannot perform current workforce actions.',
      required_administrative_action: 'Restore (unarchive) the worker, then activate if appropriate.',
      profile: {
        approval_status: profile.approval_status,
        is_active: profile.is_active,
        archived_at: profile.archived_at,
        role: profile.role,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        organization_id: profile.organization_id,
        updated_at: profile.updated_at,
      },
    }
  }

  if (profile.approval_status === 'pending') {
    return {
      worker_id: profile.id,
      found: true,
      derived_status: 'PENDING',
      can_authenticate: true,
      can_access_company_application: false,
      can_access_assigned_projects: false,
      active_project_assignments: assignmentCount,
      can_submit_attendance: false,
      can_submit_exception_request: false,
      can_be_administratively_corrected: true,
      blocking_reason: 'Registration is pending management approval.',
      required_administrative_action: 'Approve the registration in Admin, then confirm Active status.',
      profile: {
        approval_status: profile.approval_status,
        is_active: profile.is_active,
        archived_at: profile.archived_at,
        role: profile.role,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        organization_id: profile.organization_id,
        updated_at: profile.updated_at,
      },
    }
  }

  if (!profile.is_active || profile.approval_status === 'rejected') {
    return {
      worker_id: profile.id,
      found: true,
      derived_status: 'INACTIVE',
      can_authenticate: true,
      can_access_company_application: profile.approval_status === 'approved',
      can_access_assigned_projects: profile.approval_status === 'approved' && assignmentCount > 0,
      active_project_assignments: assignmentCount,
      can_submit_attendance: false,
      can_submit_exception_request: false,
      can_be_administratively_corrected: true,
      blocking_reason:
        profile.approval_status === 'rejected'
          ? 'Registration was rejected.'
          : 'Employee profile is inactive. Authentication may still work, but attendance is blocked.',
      required_administrative_action:
        profile.approval_status === 'rejected'
          ? 'Re-approve the worker in Admin if access should be granted.'
          : 'Activate Worker with a reason, then continue exception review if needed.',
      profile: {
        approval_status: profile.approval_status,
        is_active: profile.is_active,
        archived_at: profile.archived_at,
        role: profile.role,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        organization_id: profile.organization_id,
        updated_at: profile.updated_at,
      },
    }
  }

  return {
    worker_id: profile.id,
    found: true,
    derived_status: 'ACTIVE',
    can_authenticate: true,
    can_access_company_application: true,
    can_access_assigned_projects: assignmentCount > 0,
    active_project_assignments: assignmentCount,
    can_submit_attendance: true,
    can_submit_exception_request: true,
    can_be_administratively_corrected: true,
    blocking_reason: null,
    required_administrative_action: null,
    profile: {
      approval_status: profile.approval_status,
      is_active: profile.is_active,
      archived_at: profile.archived_at,
      role: profile.role,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      organization_id: profile.organization_id,
      updated_at: profile.updated_at,
    },
  }
}
