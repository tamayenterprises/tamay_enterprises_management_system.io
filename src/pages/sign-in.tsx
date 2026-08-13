import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { formatAuthError } from '@/lib/auth-errors'
import { homePathForRole } from '@/lib/utils'
import { signInSchema, type SignInValues } from '@/lib/validations'
import type { UserRole } from '@/types/database'

export function SignInPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) })

  useEffect(() => {
    if (params.get('registered') !== '1') return
    toast.success('Registration submitted. You can sign in after management approves your account.')
    navigate('/sign-in', { replace: true })
  }, [params, navigate])

  const onSubmit = handleSubmit(async (values) => {
    const { data, error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      toast.error(formatAuthError(error.message))
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('approval_status, is_active, role')
      .eq('id', data.user.id)
      .single()

    const profile = profileData as {
      approval_status: string
      is_active: boolean
      role: UserRole
    } | null

    if (!profile || profile.approval_status !== 'approved' || !profile.is_active) {
      await supabase.auth.signOut({ scope: 'global' })
      toast.error('Your account is pending approval or inactive.')
      return
    }

    toast.success('Welcome back')
    // Full navigation so auth context and route guards load cleanly together
    // (client-side navigate can bounce back to /sign-in before profile sync finishes).
    window.location.assign(homePathForRole(profile.role))
  })

  return (
    <AuthLayout>
      <Card className="w-full max-w-md border-border/70 bg-white shadow-brand">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access Tamay Enterprises — staff tools or the client portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
            </div>
            <Button className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          <div className="mt-4 space-y-3 text-sm">
            <Link className="text-primary hover:underline" to="/forgot-password">
              Forgot password?
            </Link>
            <div className="rounded-lg border border-border bg-[#fbfcff] px-3 py-2.5">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Create an account</p>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-between">
                <Link className="font-medium text-primary hover:underline" to="/client/sign-up">
                  Client / homeowner
                </Link>
                <Link className="text-muted-foreground hover:underline" to="/sign-up">
                  Staff / employee
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-brand-hero" />
        <div className="absolute -left-16 top-16 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[#35558f]/40 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md animate-rise space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-[180px] w-[180px] items-center justify-center rounded-full bg-white p-3 shadow-[0_0_0_3px_rgba(255,255,255,0.25)] shadow-brand">
            <img
              src="/tamay-logo.png"
              alt="Tamay Enterprises"
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <p className="text-sm text-white/75">Construction · Real Estate · Logistics</p>
        </div>
        {children}
      </div>
    </div>
  )
}
