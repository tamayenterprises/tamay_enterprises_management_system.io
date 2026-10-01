import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { isManagementRole } from '@/lib/utils'
import type {
  MyWorkScheduleItem,
  Profile,
  SaveWorkScheduleResult,
  UserRole,
  WorkScheduleEntry,
} from '@/types/database'

/** Phase 1: only employees and project managers can be scheduled / have a personal schedule. */
export const SCHEDULABLE_ROLES: UserRole[] = ['employee', 'project_manager']

export function canHaveWorkSchedule(role?: UserRole | null) {
  return role === 'employee' || role === 'project_manager'
}

export function useMyWorkSchedule(from: string, to: string) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['my-work-schedule', profile?.id, from, to],
    enabled: Boolean(from && to && profile?.id) && canHaveWorkSchedule(profile?.role),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_work_schedule', { p_from: from, p_to: to })
      if (error) throw error
      return ((data ?? []) as MyWorkScheduleItem[]).map((item) => ({
        ...item,
        crew: item.crew ?? [],
      }))
    },
  })
}

const MANAGEMENT_ENTRY_SELECT =
  '*, project:projects(id, name, status, job_site_address, location, latitude, longitude, location_verification_status, archived_at), assignees:work_schedule_assignees(entry_id, profile_id, organization_id, created_at, profile:profiles(id, first_name, last_name, role, approval_status, is_active, archived_at))'

export function useWorkSchedule(from: string, to: string) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['work-schedule', profile?.organization_id, from, to],
    enabled: Boolean(from && to && profile?.organization_id) && isManagementRole(profile?.role),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_schedule_entries')
        .select(MANAGEMENT_ENTRY_SELECT)
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date', { ascending: true })
        .order('start_time', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as WorkScheduleEntry[]
    },
  })
}

export type ScheduleProjectContact = {
  client: { name: string; phone: string | null } | null
  activeProfileIds: Set<string>
}

/**
 * Management-only: primary client (earliest active client assignment) and active assignee ids
 * per project. Employees get the same client info only through `get_my_work_schedule`.
 */
export function useScheduleProjectContacts(projectIds: string[]) {
  const { profile } = useAuth()
  const ids = Array.from(new Set(projectIds)).sort()
  return useQuery({
    queryKey: ['schedule-project-contacts', ids.join(',')],
    enabled: ids.length > 0 && isManagementRole(profile?.role),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(
          'project_id, profile_id, assigned_at, profile:profiles!profile_id(id, first_name, last_name, company_name, phone, role, archived_at)',
        )
        .in('project_id', ids)
        .eq('is_active', true)
        .order('assigned_at', { ascending: true })
      if (error) throw error

      const byProject = new Map<string, ScheduleProjectContact>()
      for (const id of ids) byProject.set(id, { client: null, activeProfileIds: new Set() })

      for (const row of (data ?? []) as unknown as Array<{
        project_id: string
        profile_id: string
        profile:
          | Pick<Profile, 'id' | 'first_name' | 'last_name' | 'company_name' | 'phone' | 'role' | 'archived_at'>
          | Array<Pick<Profile, 'id' | 'first_name' | 'last_name' | 'company_name' | 'phone' | 'role' | 'archived_at'>>
          | null
      }>) {
        const entry = byProject.get(row.project_id)
        if (!entry) continue
        entry.activeProfileIds.add(row.profile_id)
        const person = Array.isArray(row.profile) ? row.profile[0] : row.profile
        if (!person || person.role !== 'client' || person.archived_at || entry.client) continue
        const name =
          `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() || person.company_name?.trim() || 'Client'
        entry.client = { name, phone: person.phone?.trim() || null }
      }
      return byProject
    },
  })
}

export type SaveWorkScheduleInput = {
  entryId?: string | null
  projectId: string
  workDate: string
  startTime: string
  endTime?: string | null
  task: string
  notes?: string | null
  assigneeIds: string[]
}

function invalidateSchedule(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['work-schedule'] })
  queryClient.invalidateQueries({ queryKey: ['my-work-schedule'] })
  queryClient.invalidateQueries({ queryKey: ['schedule-project-contacts'] })
  queryClient.invalidateQueries({ queryKey: ['project-assignments'] })
  queryClient.invalidateQueries({ queryKey: ['profile-assignments'] })
  queryClient.invalidateQueries({ queryKey: ['assignment-history'] })
  queryClient.invalidateQueries({ queryKey: ['projects'] })
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
}

export function useSaveWorkScheduleEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveWorkScheduleInput) => {
      const { data, error } = await supabase.rpc('save_work_schedule_entry', {
        p_entry_id: input.entryId ?? null,
        p_project_id: input.projectId,
        p_work_date: input.workDate,
        p_start_time: input.startTime,
        p_end_time: input.endTime || null,
        p_task: input.task,
        p_notes: input.notes?.trim() ? input.notes : null,
        p_assignee_ids: input.assigneeIds,
      })
      if (error) throw error
      const result = data as SaveWorkScheduleResult | null
      return {
        entry_id: result?.entry_id ?? input.entryId ?? '',
        auto_assigned: result?.auto_assigned ?? [],
        double_booked: result?.double_booked ?? [],
      } satisfies SaveWorkScheduleResult
    },
    onSuccess: () => invalidateSchedule(queryClient),
  })
}

export function useDeleteWorkScheduleEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.rpc('delete_work_schedule_entry', { p_id: entryId })
      if (error) throw error
    },
    onSuccess: () => invalidateSchedule(queryClient),
  })
}
