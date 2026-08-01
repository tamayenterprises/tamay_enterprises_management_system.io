export type UserRole = 'admin' | 'project_manager' | 'employee' | 'subcontractor'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ProjectStatus = 'not_started' | 'in_progress' | 'waiting' | 'completed'
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent'
export type CertificationStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing'
export type WorkforceStatus =
  | 'active'
  | 'on_site'
  | 'traveling_to_site'
  | 'on_break'
  | 'completed_for_day'
  | 'off_site'
  | 'inactive'
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

export type LocationVerificationStatus = 'unverified' | 'needs_verification' | 'verified'
export type AttendanceWorkflowStatus = 'working' | 'on_break' | 'completed'
export type AttendanceActionType = 'WORK_STARTED' | 'BREAK_STARTED' | 'BREAK_ENDED' | 'WORK_ENDED'
export type AttendanceValidationResult =
  | 'approved'
  | 'rejected_outside_geofence'
  | 'rejected_poor_accuracy'
  | 'rejected_location_unavailable'
  | 'rejected_project_unverified'
  | 'rejected_not_assigned'
  | 'rejected_invalid_transition'
  | 'rejected_duplicate'
  | 'rejected_other'
export type ExceptionRequestStatus = 'pending' | 'approved' | 'rejected'

export interface Project {
  id: string
  organization_id: string
  name: string
  description: string | null
  location: string | null
  job_site_address: string | null
  latitude: number | null
  longitude: number | null
  geofence_radius_meters: number
  location_verification_status: LocationVerificationStatus
  location_verified_at: string | null
  location_verified_by: string | null
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
  parent_id: string | null
  content: string | null
  photo_path: string | null
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

export interface WorkerStatusUpdate {
  id: string
  organization_id: string
  user_id: string
  project_id: string | null
  status: WorkforceStatus
  note: string | null
  created_at: string
  project?: Project
}

export interface CurrentWorkerStatus {
  id: string
  organization_id: string
  user_id: string
  project_id: string | null
  status: WorkforceStatus
  note: string | null
  updated_at: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
  company_name: string | null
  project_name: string | null
  avatar_url: string | null
}

export interface AttendanceRecord {
  id: string
  organization_id: string
  user_id: string
  project_id: string | null
  clock_in_time: string
  clock_out_time: string | null
  total_hours: number | null
  paid_hours: number | null
  break_seconds: number
  workflow_status: AttendanceWorkflowStatus | null
  active_break_started_at: string | null
  geofence_enforced: boolean
  notes: string | null
  created_at: string
  updated_at: string
  project?: Project | null
  profile?: Profile | null
}

export interface AttendanceEvent {
  id: string
  organization_id: string
  attendance_record_id: string
  user_id: string
  project_id: string | null
  action: AttendanceActionType
  server_timestamp: string
  employee_latitude: number | null
  employee_longitude: number | null
  device_accuracy_meters: number | null
  project_latitude: number | null
  project_longitude: number | null
  calculated_distance_meters: number | null
  authorized_radius_meters: number | null
  validation_result: AttendanceValidationResult
  session_id: string | null
  device_info: Record<string, unknown> | null
  created_at: string
}

export interface AttendanceAttempt {
  id: string
  organization_id: string
  user_id: string
  project_id: string | null
  attendance_record_id: string | null
  action: AttendanceActionType
  server_timestamp: string
  employee_latitude: number | null
  employee_longitude: number | null
  device_accuracy_meters: number | null
  project_latitude: number | null
  project_longitude: number | null
  calculated_distance_meters: number | null
  authorized_radius_meters: number | null
  max_accuracy_meters: number | null
  validation_result: AttendanceValidationResult
  rejection_reason: string | null
  session_id: string | null
  device_info: Record<string, unknown> | null
  idempotency_key: string | null
  created_at: string
  profile?: Profile | null
  project?: Project | null
}

export interface AttendanceExceptionRequest {
  id: string
  organization_id: string
  user_id: string
  project_id: string
  requested_action: AttendanceActionType
  server_timestamp: string
  employee_latitude: number | null
  employee_longitude: number | null
  device_accuracy_meters: number | null
  calculated_distance_meters: number | null
  explanation: string
  photo_path: string | null
  status: ExceptionRequestStatus
  admin_decision_by: string | null
  admin_note: string | null
  decided_at: string | null
  resulting_attendance_record_id: string | null
  created_at: string
  updated_at: string
  profile?: Profile | null
  project?: Project | null
}

export interface AttendanceCorrection {
  id: string
  organization_id: string
  attendance_record_id: string
  corrected_by: string
  reason: string
  original_values: Record<string, unknown>
  corrected_values: Record<string, unknown>
  created_at: string
  corrector?: Profile | null
}

export interface AttendanceActionResult {
  ok: boolean
  validation_result: AttendanceValidationResult
  rejection_reason?: string | null
  attempt_id?: string
  event_id?: string
  attendance_record_id?: string
  workflow_status?: AttendanceWorkflowStatus
  server_timestamp?: string
  distance_meters?: number | null
  authorized_radius_meters?: number
  max_accuracy_meters?: number
  allow_exception_request?: boolean
  paid_hours?: number | null
  break_seconds?: number | null
  total_hours?: number | null
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
      worker_status_updates: {
        Row: WorkerStatusUpdate
        Insert: Partial<WorkerStatusUpdate>
        Update: Partial<WorkerStatusUpdate>
      }
      attendance_records: {
        Row: AttendanceRecord
        Insert: Partial<AttendanceRecord>
        Update: Partial<AttendanceRecord>
      }
      attendance_events: {
        Row: AttendanceEvent
        Insert: Partial<AttendanceEvent>
        Update: Partial<AttendanceEvent>
      }
      attendance_attempts: {
        Row: AttendanceAttempt
        Insert: Partial<AttendanceAttempt>
        Update: Partial<AttendanceAttempt>
      }
      attendance_exception_requests: {
        Row: AttendanceExceptionRequest
        Insert: Partial<AttendanceExceptionRequest>
        Update: Partial<AttendanceExceptionRequest>
      }
      attendance_corrections: {
        Row: AttendanceCorrection
        Insert: Partial<AttendanceCorrection>
        Update: Partial<AttendanceCorrection>
      }
    }
  }
}
