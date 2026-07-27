import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { formatAuthError } from '@/lib/auth-errors'
import { signInSchema, type SignInValues } from '@/lib/validations'

export function SignInPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) })

  const onSubmit = handleSubmit(async (values) => {
    const { data, error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      toast.error(formatAuthError(error.message))
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('approval_status, is_active')
      .eq('id', data.user.id)
      .single()

    const profile = profileData as { approval_status: string; is_active: boolean } | null

    if (!profile || profile.approval_status !== 'approved' || !profile.is_active) {
      await supabase.auth.signOut({ scope: 'local' })
      toast.error('Your account is pending approval or inactive.')
      return
    }

    toast.success('Welcome back')
    navigate('/dashboard', { replace: true })
  })

  return (
    <AuthLayout>
      <Card className="w-full max-w-md border-border/60 bg-card/95 shadow-xl shadow-black/20 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="tracking-wide">Sign in</CardTitle>
          <CardDescription>Access the Tamay Enterprises management system.</CardDescription>
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
          <div className="mt-4 flex justify-between text-sm">
            <Link className="text-primary hover:underline" to="/forgot-password">
              Forgot password?
            </Link>
            <Link className="text-primary hover:underline" to="/sign-up">
              Create account
            </Link>
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
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0a2236_0%,#0f3d5e_48%,#16324a_100%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(245,248,251,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(245,248,251,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="absolute -left-16 top-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md animate-rise space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm bg-accent text-base font-bold text-accent-foreground animate-brand-pulse">
            TE
          </div>
          <p className="brand-mark text-4xl font-semibold text-white">Tamay Enterprises</p>
          <p className="mt-2 text-sm text-white/70">Construction workforce & project operations</p>
        </div>
        {children}
      </div>
    </div>
  )
}
