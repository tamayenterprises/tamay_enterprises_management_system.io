export type UserRole = 'admin' | 'project_manager' | 'employee' | 'subcontractor'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ProjectStatus = 'not_started' | 'in_progress' | 'waiting' | 'completed'
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent'
export type CertificationStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing'
export type DocumentCategory =
  | 'certification'
  | 'license'
  | 'insurance'
  | 'contract'
  | 'identification'
  | 'work_photo'
  | 'project_file'
  | 'company'
  | 'miscellaneous'
export type AssignmentAction = 'assigned' | 'removed' | 'reassigned'

export interface RoleOption {
  id: UserRole
  label: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  organization_id: string | null
  email: string
  first_name: string
  last_name: string
  phone: string | null
  role: UserRole
  approval_status: ApprovalStatus
  is_active: boolean
  avatar_url: string | null
  position: string | null
  hire_date: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  internal_notes: string | null
  company_name: string | null
  trade_specialization: string | null
  insurance_info: string | null
  license_info: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  organization_id: string
  name: string
  description: string | null
  location: string | null
  status: ProjectStatus
  priority: ProjectPriority
  start_date: string | null
  deadline: string | null
  created_by: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface ProjectAssignment {
  id: string
  project_id: string
  profile_id: string
  assigned_by: string | null
  assigned_at: string
  removed_at: string | null
  is_active: boolean
  profile?: Profile
  project?: Project
}

export interface AssignmentHistory {
  id: string
  project_id: string
  profile_id: string
  action: AssignmentAction
  performed_by: string | null
  notes: string | null
  created_at: string
}

export interface ProjectNote {
  id: string
  project_id: string
  author_id: string | null
  content: string
  created_at: string
  updated_at: string
  author?: Profile
}

export interface Certification {
  id: string
  organization_id: string
  profile_id: string
  name: string
  certification_type: string
  issue_date: string | null
  expiration_date: string | null
  status: CertificationStatus
  document_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  profile?: Profile
}

export interface DocumentRecord {
  id: string
  organization_id: string
  owner_id: string | null
  project_id: string | null
  uploaded_by: string | null
  name: string
  category: DocumentCategory
  storage_path: string
  mime_type: string | null
  file_size: number | null
  created_at: string
  updated_at: string
  owner?: Profile
  uploader?: Profile
  project?: Project
}

export interface Notification {
  id: string
  organization_id: string
  recipient_id: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export interface ActivityLog {
  id: string
  organization_id: string
  actor_id: string | null
  entity_type: string
  entity_id: string | null
  action: string
  metadata: Record<string, unknown>
  created_at: string
  actor?: Profile
}

export interface Database {
  public: {
    Tables: {
      organizations: { Row: Organization; Insert: Partial<Organization>; Update: Partial<Organization> }
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> }
      project_assignments: {
        Row: ProjectAssignment
        Insert: Partial<ProjectAssignment>
        Update: Partial<ProjectAssignment>
      }
      assignment_history: {
        Row: AssignmentHistory
        Insert: Partial<AssignmentHistory>
        Update: Partial<AssignmentHistory>
      }
      project_notes: { Row: ProjectNote; Insert: Partial<ProjectNote>; Update: Partial<ProjectNote> }
      certifications: { Row: Certification; Insert: Partial<Certification>; Update: Partial<Certification> }
      documents: { Row: DocumentRecord; Insert: Partial<DocumentRecord>; Update: Partial<DocumentRecord> }
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> }
      activity_log: { Row: ActivityLog; Insert: Partial<ActivityLog>; Update: Partial<ActivityLog> }
    }
  }
}
