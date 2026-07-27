import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AuthLayout } from '@/pages/sign-in'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { supabase } from '@/lib/supabase'
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from '@/lib/validations'
import type { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = handleSubmit(async (values) => {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password reset email sent if the account exists.')
  })

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>We will email you a secure reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <Button className="w-full" disabled={isSubmitting}>
              Send reset link
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link className="text-primary hover:underline" to="/sign-in">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = handleSubmit(async (values) => {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password updated. You can sign in with your new password.')
  })

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>
            <Button className="w-full" disabled={isSubmitting}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

export function PendingApprovalPage() {
  const { signOut, profile, loading, session } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) {
      navigate('/sign-in', { replace: true })
      return
    }
    if (profile?.approval_status === 'approved' && profile.is_active) {
      navigate('/dashboard', { replace: true })
    }
  }, [loading, session, profile, navigate])

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/sign-in', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out')
      setSigningOut(false)
    }
  }

  if (loading || (profile?.approval_status === 'approved' && profile.is_active)) {
    return <LoadingState label="Checking account status..." />
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Pending approval</CardTitle>
          <CardDescription>
            {profile
              ? `Thanks ${profile.first_name}. Your registration is waiting for management approval.`
              : 'Your registration is waiting for management approval.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You will receive access once an admin approves your account. Unapproved users cannot enter the system.
          </p>
          <Button variant="outline" className="w-full" disabled={signingOut} onClick={handleSignOut}>
            {signingOut ? 'Signing out...' : 'Sign out'}
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

export function ChangePasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<z.infer<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) })

  const onSubmit = handleSubmit(async (values) => {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      toast.error(error.message)
      return
    }
    reset()
    toast.success('Password changed')
  })

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Change password</h1>
        <p className="text-sm text-muted-foreground">Update your account credentials.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>
            <Button disabled={isSubmitting}>Save password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
