import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[0-9]/, 'Include at least one number')

export const signUpSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email'),
    phone: z.string().min(7, 'Enter a valid phone number'),
    password: passwordSchema,
    confirmPassword: z.string().min(8, 'Confirm your password'),
    role: z.enum(['employee', 'subcontractor']),
    companyName: z.string().optional(),
    tradeSpecialization: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => data.role !== 'subcontractor' || Boolean(data.companyName?.trim()),
    {
      message: 'Company name is required for subcontractors',
      path: ['companyName'],
    },
  )

export const clientSignUpSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email'),
    phone: z.string().min(7, 'Enter a valid phone number'),
    password: passwordSchema,
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const projectRequestSchema = z.object({
  title: z.string().min(1, 'Project title is required'),
  description: z.string().min(1, 'Describe the work you need'),
  location: z.string().min(1, 'Job site address or location is required'),
  preferred_start_date: z.string().optional().nullable(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
})

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const profileSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  hire_date: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  company_name: z.string().optional().nullable(),
  trade_specialization: z.string().optional().nullable(),
  insurance_info: z.string().optional().nullable(),
  license_info: z.string().optional().nullable(),
  role: z.enum(['admin', 'project_manager', 'employee', 'subcontractor', 'client']).optional(),
  is_active: z.boolean().optional(),
})

export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  status: z.enum(['not_started', 'in_progress', 'waiting', 'completed']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  start_date: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
})

export const certificationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  certification_type: z.string().min(1, 'Type is required'),
  issue_date: z.string().optional().nullable(),
  expiration_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  profile_id: z.string().uuid(),
})

export const documentSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    'certification',
    'license',
    'insurance',
    'contract',
    'identification',
    'work_photo',
    'project_file',
    'company',
    'miscellaneous',
  ]),
  project_id: z.string().uuid().optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
})

export type SignInValues = z.infer<typeof signInSchema>
export type SignUpValues = z.infer<typeof signUpSchema>
export type ClientSignUpValues = z.infer<typeof clientSignUpSchema>
export type ProjectRequestFormValues = z.infer<typeof projectRequestSchema>
export type ProjectFormValues = z.infer<typeof projectSchema>
export type ProfileFormValues = z.infer<typeof profileSchema>
export type CertificationFormValues = z.infer<typeof certificationSchema>
