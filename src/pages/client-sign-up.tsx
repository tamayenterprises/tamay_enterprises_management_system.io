import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AuthLayout } from '@/pages/sign-in'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { formatAuthError } from '@/lib/auth-errors'
import { clientSignUpSchema, type ClientSignUpValues } from '@/lib/validations'

export function ClientSignUpPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientSignUpValues>({
    resolver: zodResolver(clientSignUpSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          first_name: values.firstName,
          last_name: values.lastName,
          phone: values.phone,
          role: 'client',
        },
      },
    })

    if (error) {
      toast.error(formatAuthError(error.message))
      return
    }

    await supabase.auth.signOut()
    toast.success('Client registration submitted. You can sign in after Tamay Enterprises approves your account.')
    navigate('/sign-in', { replace: true })
  })

  return (
    <AuthLayout>
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader>
          <CardTitle>Client account</CardTitle>
          <CardDescription>
            Create a client portal account to request projects, share documents and photos, and follow updates.
            Approval is required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...register('firstName')} />
                {errors.firstName ? <p className="text-xs text-destructive">{errors.firstName.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...register('lastName')} />
                {errors.lastName ? <p className="text-xs text-destructive">{errors.lastName.message}</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" autoComplete="tel" {...register('phone')} />
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
              {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>
            <Button className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Create client account'}
            </Button>
          </form>
          <div className="mt-4 flex justify-between text-sm">
            <Link className="text-primary hover:underline" to="/sign-in">
              Back to sign in
            </Link>
            <Link className="text-muted-foreground hover:underline" to="/sign-up">
              Staff sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
