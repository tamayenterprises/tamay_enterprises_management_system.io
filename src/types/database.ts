export type UserRole = 'admin' | 'project_manager' | 'employee' | 'subcontractor' | 'client'
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
export type ExceptionRequestStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'resolved'

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
  warranty_ends_on: string | null
  original_project_total?: number | string | null
  current_project_total?: number | string | null
  project_total_updated_at?: string | null
  project_total_updated_by?: string | null
  created_by: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectPaymentStatus = 'due' | 'partial' | 'paid' | 'void'
export type ProjectPaymentMethod = 'check' | 'stripe' | 'other'
export type ProjectPaymentStageKey =
  | 'initial'
  | 'progress'
  | 'second_progress'
  | 'final'
  | 'other'

export interface ProjectPayment {
  id: string
  organization_id: string
  project_id: string
  label: string
  stage_key: ProjectPaymentStageKey
  expected_percent: number | string | null
  expected_amount: number | string
  actual_amount: number | string
  status: ProjectPaymentStatus
  method: ProjectPaymentMethod | null
  received_on: string | null
  check_reference: string | null
  proof_storage_path: string | null
  proof_mime_type: string | null
  proof_file_name: string | null
  notes: string | null
  stripe_payment_link_url: string | null
  stripe_payment_link_active: boolean
  sort_order: number
  created_by: string | null
  updated_by: string | null
  voided_at: string | null
  voided_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectReceipt {
  id: string
  organization_id: string
  project_id: string
  receipt_number: string | null
  amount: number | string
  received_on: string
  proof_storage_path: string | null
  proof_mime_type: string | null
  proof_file_name: string | null
  notes: string | null
  status: 'active' | 'void'
  created_by: string | null
  updated_by: string | null
  voided_at: string | null
  voided_by: string | null
  created_at: string
  updated_at: string
  uploader?: Profile | null
}

export interface ProjectFinancialAudit {
  id: string
  organization_id: string
  project_id: string
  payment_id: string | null
  receipt_id: string | null
  entity_type: 'payment' | 'receipt' | 'project_total'
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
}

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'canceled'
export type PaymentMethod = 'stripe' | 'manual'

export interface Payment {
  id: string
  organization_id: string
  project_id: string
  recipient_id: string
  created_by: string
  payer_email: string | null
  amount_cents: number
  currency: string
  description: string
  status: PaymentStatus
  method?: PaymentMethod
  stripe_payment_link_id: string | null
  payment_link_url: string | null
  stripe_checkout_session_id: string | null
  paid_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  project?: Project | null
  recipient?: Profile | null
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
  requires_attention?: boolean
  visible_to_client?: boolean
  created_at: string
  updated_at: string
  author?: Profile
}

export type ProjectRequestStatus = 'pending' | 'under_review' | 'approved' | 'declined' | 'converted'

export interface ProjectRequest {
  id: string
  organization_id: string
  client_id: string
  title: string
  description: string | null
  location: string | null
  preferred_start_date: string | null
  status: ProjectRequestStatus
  converted_project_id: string | null
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  client?: Profile
  converted_project?: Project | null
  files?: ProjectRequestFile[]
}

export interface ProjectRequestFile {
  id: string
  organization_id: string
  request_id: string
  uploaded_by: string
  name: string
  file_kind: 'document' | 'photo'
  storage_path: string
  mime_type: string | null
  file_size: number | null
  created_at: string
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
  /** Optional photo/document type label (Progress, Agreement, etc.). */
  kind_label?: string | null
  storage_path: string
  mime_type: string | null
  file_size: number | null
  created_at: string
  updated_at: string
  owner?: Profile
  uploader?: Profile
  project?: Project
}

export type ProjectActivityType =
  | 'COMMENT_CREATED'
  | 'COMMENT_REPLIED'
  | 'USER_MENTIONED'
  | 'PHOTO_UPLOADED'
  | 'FILE_UPLOADED'
  | 'PROJECT_STATUS_CHANGED'
  | 'USER_ASSIGNED_TO_PROJECT'
  | 'USER_REMOVED_FROM_PROJECT'
  | 'ATTENDANCE_STARTED'
  | 'BREAK_STARTED'
  | 'BREAK_ENDED'
  | 'ATTENDANCE_ENDED'
  | 'ATTENDANCE_REJECTED'
  | 'ATTENDANCE_EXCEPTION_SUBMITTED'
  | 'ATTENDANCE_CORRECTED'
  | 'ATTENTION_REQUESTED'
  | 'ATTENTION_REVIEWED'
  | 'ATTENTION_RESOLVED'
  | 'COMPANY_UPDATE_CREATED'
  | 'COMPANY_UPDATE_REPLIED'
  | 'COMPANY_UPDATE_MENTIONED'
  | 'GENERAL'

export type NotificationRelevance =
  | 'requires_attention'
  | 'mentioned'
  | 'reply_to_you'
  | 'reply_to_your_update'
  | 'assigned_project'
  | 'you_are_assigned'
  | 'company_update'
  | 'general'
  | 'not_involved'

export type CompanyUpdateAudience =
  | 'all_internal'
  | 'employees'
  | 'management'
  | 'project_managers'
  | 'selected_users'

export interface CompanyUpdate {
  id: string
  organization_id: string
  author_id: string | null
  parent_id: string | null
  content: string | null
  photo_path: string | null
  audience_type: CompanyUpdateAudience
  replies_enabled: boolean
  requires_attention: boolean
  notify_project_team: boolean
  created_at: string
  updated_at: string
  author?: Profile | null
  project_refs?: Array<{ project_id: string; project?: Project | null }>
}

export type AttentionReviewStatus = 'none' | 'new' | 'reviewed' | 'resolved'

export interface Notification {
  id: string
  organization_id: string
  recipient_id: string
  actor_id?: string | null
  project_id?: string | null
  activity_id?: string | null
  activity_type?: ProjectActivityType | null
  entity_type?: string | null
  entity_id?: string | null
  parent_entity_id?: string | null
  relevance?: NotificationRelevance | null
  priority?: number
  title: string
  message: string
  preview_text?: string | null
  link: string | null
  destination_route?: string | null
  is_read: boolean
  read_at?: string | null
  review_status?: AttentionReviewStatus
  thumbnail_path?: string | null
  metadata?: Record<string, unknown>
  created_at: string
  updated_at?: string
  actor?: Profile | null
  project?: Project | null
}

export interface ProjectActivityEvent {
  id: string
  organization_id: string
  project_id: string | null
  actor_id: string | null
  activity_type: ProjectActivityType
  entity_type: string | null
  entity_id: string | null
  parent_entity_id: string | null
  title: string
  preview_text: string | null
  destination_route: string | null
  thumbnail_path: string | null
  requires_attention: boolean
  metadata: Record<string, unknown>
  created_at: string
  actor?: Profile | null
  project?: Project | null
}

export interface NotificationPreferences {
  user_id: string
  mentions_enabled: boolean
  replies_to_my_comments: boolean
  assigned_project_comments: boolean
  assigned_project_photos: boolean
  general_project_activity: boolean
  attendance_alerts: boolean
  requires_attention_enabled: boolean
  company_updates_enabled?: boolean
  admin_feed_mode: 'all' | 'high_priority' | 'assigned_only'
  updated_at: string
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
  attendance_record_id?: string | null
  work_date?: string | null
  idempotency_key?: string | null
  correction_id?: string | null
  duplicate_of_request_id?: string | null
  follow_up_note?: string | null
  review_started_at?: string | null
  revision?: number
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
  exception_request_id?: string | null
  correction_mode?: string | null
  correction_reason_code?: string | null
  administrative_notes?: string | null
  original_timeline?: unknown
  corrected_timeline?: unknown
  original_totals?: Record<string, unknown> | null
  corrected_totals?: Record<string, unknown> | null
  revision?: number
  creation_source?: string | null
  idempotency_key?: string | null
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

export type WorkerStatusAction =
  | 'activated'
  | 'deactivated'
  | 'suspended'
  | 'restored'
  | 'archived'
  | 'unarchived'
  | 'approved'
  | 'rejected'
  | 'onboarding_completed'

export interface WorkerStatusHistory {
  id: string
  organization_id: string
  worker_id: string
  changed_by: string | null
  action: WorkerStatusAction
  reason: string
  previous_values: Record<string, unknown>
  new_values: Record<string, unknown>
  created_at: string
}

export interface FormDraftRecord {
  id: string
  organization_id: string
  owner_user_id: string
  draft_type: string
  entity_type: string | null
  entity_id: string | null
  project_id: string | null
  context_key: string
  payload: Record<string, unknown>
  schema_version: number
  status: string
  published_entity_id: string | null
  revision: number
  device_ref: string | null
  expires_at: string
  last_opened_at: string | null
  last_saved_at: string
  discarded_at: string | null
  created_at: string
  updated_at: string
}

export interface CompanyUpdateProjectRef {
  update_id: string
  project_id: string
  created_at: string
}

export interface ProjectNoteProjectRef {
  note_id: string
  project_id: string
  created_at: string
}

export interface ProjectNoteMention {
  id: string
  note_id: string
  mentioned_user_id: string
  created_at: string
}

/** Hand-maintained until `supabase gen types` is wired to production. */
type AsRow<T> = T & Record<string, unknown>

type Fk<Name extends string, Col extends string, To extends string> = {
  foreignKeyName: Name
  columns: [Col]
  isOneToOne: false
  referencedRelation: To
  referencedColumns: ['id']
}

type Table<Row, Rel extends Fk<string, string, string>[] = []> = {
  Row: AsRow<Row>
  Insert: AsRow<Partial<Row>>
  Update: AsRow<Partial<Row>>
  Relationships: Rel
}

type View<Row> = {
  Row: AsRow<Row>
  Relationships: []
}

type Rpc<Args extends Record<string, unknown> = Record<string, unknown>, Returns = unknown> = {
  Args: Args
  Returns: Returns
}

export interface Database {
  public: {
    Tables: {
      organizations: Table<Organization>
      roles: Table<RoleOption>
      profiles: Table<Profile>
      projects: Table<Project>
      project_payments: Table<ProjectPayment>
      project_receipts: Table<ProjectReceipt>
      project_payment_audit: Table<ProjectFinancialAudit>
      payments: Table<
        Payment,
        [
          Fk<'payments_project_id_fkey', 'project_id', 'projects'>,
          Fk<'payments_recipient_id_fkey', 'recipient_id', 'profiles'>,
          Fk<'payments_created_by_fkey', 'created_by', 'profiles'>,
        ]
      >
      project_assignments: Table<
        ProjectAssignment,
        [
          Fk<'project_assignments_profile_id_fkey', 'profile_id', 'profiles'>,
          Fk<'project_assignments_project_id_fkey', 'project_id', 'projects'>,
          Fk<'project_assignments_assigned_by_fkey', 'assigned_by', 'profiles'>,
        ]
      >
      assignment_history: Table<
        AssignmentHistory,
        [
          Fk<'assignment_history_profile_id_fkey', 'profile_id', 'profiles'>,
          Fk<'assignment_history_project_id_fkey', 'project_id', 'projects'>,
          Fk<'assignment_history_performed_by_fkey', 'performed_by', 'profiles'>,
        ]
      >
      project_notes: Table<
        ProjectNote,
        [
          Fk<'project_notes_project_id_fkey', 'project_id', 'projects'>,
          Fk<'project_notes_author_id_fkey', 'author_id', 'profiles'>,
          Fk<'project_notes_parent_id_fkey', 'parent_id', 'project_notes'>,
        ]
      >
      project_note_mentions: Table<ProjectNoteMention>
      project_note_project_refs: Table<ProjectNoteProjectRef>
      project_requests: Table<
        ProjectRequest,
        [
          Fk<'project_requests_client_id_fkey', 'client_id', 'profiles'>,
          Fk<'project_requests_converted_project_id_fkey', 'converted_project_id', 'projects'>,
        ]
      >
      project_request_files: Table<
        ProjectRequestFile,
        [
          Fk<'project_request_files_request_id_fkey', 'request_id', 'project_requests'>,
          Fk<'project_request_files_uploaded_by_fkey', 'uploaded_by', 'profiles'>,
        ]
      >
      certifications: Table<
        Certification,
        [Fk<'certifications_profile_id_fkey', 'profile_id', 'profiles'>]
      >
      documents: Table<
        DocumentRecord,
        [
          Fk<'documents_owner_id_fkey', 'owner_id', 'profiles'>,
          Fk<'documents_uploaded_by_fkey', 'uploaded_by', 'profiles'>,
          Fk<'documents_project_id_fkey', 'project_id', 'projects'>,
        ]
      >
      notifications: Table<
        Notification,
        [
          Fk<'notifications_recipient_id_fkey', 'recipient_id', 'profiles'>,
          Fk<'notifications_actor_id_fkey', 'actor_id', 'profiles'>,
          Fk<'notifications_project_id_fkey', 'project_id', 'projects'>,
        ]
      >
      project_activity_events: Table<
        ProjectActivityEvent,
        [
          Fk<'project_activity_events_actor_id_fkey', 'actor_id', 'profiles'>,
          Fk<'project_activity_events_project_id_fkey', 'project_id', 'projects'>,
        ]
      >
      company_updates: Table<
        CompanyUpdate,
        [
          Fk<'company_updates_author_id_fkey', 'author_id', 'profiles'>,
          Fk<'company_updates_parent_id_fkey', 'parent_id', 'company_updates'>,
        ]
      >
      company_update_project_refs: Table<
        CompanyUpdateProjectRef,
        [
          Fk<'company_update_project_refs_update_id_fkey', 'update_id', 'company_updates'>,
          Fk<'company_update_project_refs_project_id_fkey', 'project_id', 'projects'>,
        ]
      >
      notification_preferences: Table<NotificationPreferences>
      activity_log: Table<
        ActivityLog,
        [Fk<'activity_log_actor_id_fkey', 'actor_id', 'profiles'>]
      >
      worker_status_updates: Table<
        WorkerStatusUpdate,
        [
          Fk<'worker_status_updates_user_id_fkey', 'user_id', 'profiles'>,
          Fk<'worker_status_updates_project_id_fkey', 'project_id', 'projects'>,
        ]
      >
      worker_status_history: Table<
        WorkerStatusHistory,
        [
          Fk<'worker_status_history_worker_id_fkey', 'worker_id', 'profiles'>,
          Fk<'worker_status_history_changed_by_fkey', 'changed_by', 'profiles'>,
        ]
      >
      form_drafts: Table<FormDraftRecord>
      attendance_records: Table<AttendanceRecord>
      attendance_events: Table<AttendanceEvent>
      attendance_attempts: Table<AttendanceAttempt>
      attendance_exception_requests: Table<AttendanceExceptionRequest>
      attendance_corrections: Table<AttendanceCorrection>
    }
    Views: {
      current_worker_statuses: View<CurrentWorkerStatus>
    }
    Functions: {
      record_attendance_action: Rpc
      correct_attendance_record: Rpc
      submit_attendance_exception: Rpc
      resolve_attendance_exception: Rpc
      verify_project_location: Rpc
      convert_project_request: Rpc
      admin_hard_delete_project: Rpc
      get_worker_eligibility: Rpc
      set_worker_status: Rpc
      run_certification_maintenance: Rpc
      register_project_note_mentions: Rpc
      register_project_note_project_refs: Rpc
      register_company_update_extras: Rpc
      get_form_draft: Rpc
      upsert_form_draft: Rpc
      discard_form_draft: Rpc
      publish_form_draft: Rpc
      list_my_form_drafts: Rpc
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
