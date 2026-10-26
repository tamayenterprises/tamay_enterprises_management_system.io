import { supabase } from '@/lib/supabase'
import { buildIlikeOrFilter } from '@/lib/utils'
import type { Profile, UserRole } from '@/types/database'

export interface ListProfilesParams {
  ids?: string[]
  roles?: UserRole[]
  search?: string
  includeArchived?: boolean
  approvalStatus?: Profile['approval_status']
}

/**
 * Profiles with contact/HR fields filled in only where the viewer may see them
 * (self, admin, project manager per policy). Everyone else gets nulls.
 */
export async function listProfiles(params: ListProfilesParams = {}) {
  const search = params.search?.replace(/[%_\\]/g, ' ').trim().slice(0, 100) || undefined
  const { data, error } = await supabase.rpc('list_profiles', {
    p_ids: params.ids ?? null,
    p_roles: params.roles ?? null,
    p_search: search ?? null,
    p_include_archived: params.includeArchived ?? false,
    p_approval_status: params.approvalStatus ?? null,
  })
  if (error?.code === 'PGRST202') return listProfilesFromTable({ ...params, search })
  if (error) throw error
  return (data ?? []) as Profile[]
}

/** Databases without the workforce-security migration (the table is still fully readable there). */
async function listProfilesFromTable(params: ListProfilesParams) {
  let query = supabase.from('profiles').select('*').order('last_name').order('first_name')
  if (params.ids) query = query.in('id', params.ids)
  if (params.roles) query = query.in('role', params.roles)
  if (!params.includeArchived) query = query.is('archived_at', null)
  if (params.approvalStatus) query = query.eq('approval_status', params.approvalStatus)
  if (params.search) {
    const filter = buildIlikeOrFilter(['first_name', 'last_name', 'email', 'company_name'], params.search)
    if (filter) query = query.or(filter)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function fetchProfile(id: string) {
  const [profile] = await listProfiles({ ids: [id], includeArchived: true })
  if (!profile) throw new Error('Profile not found')
  return profile
}
