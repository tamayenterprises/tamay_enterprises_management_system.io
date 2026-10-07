import type { EmployeeStatus } from '@/features/projects/my-projects-model'

/** Restrained semantic accents: a small dot plus a light tint. Everything else stays navy / gold / white. */
export const STATUS_DOT: Record<EmployeeStatus, string> = {
  open: 'bg-[#e9a23b]',
  in_progress: 'bg-[#2f74c0]',
  waiting: 'bg-[#f08c2e]',
  completed: 'bg-[#2f9e6b]',
}

export const STATUS_TINT: Record<EmployeeStatus, string> = {
  open: 'bg-[#fdf4e3] text-[#8a5a12]',
  in_progress: 'bg-[#e8f0fa] text-[#1f5c9c]',
  waiting: 'bg-[#fdeedf] text-[#97540f]',
  completed: 'bg-[#e6f4ec] text-[#21744b]',
}
