import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AuthLayout } from '@/pages/sign-in'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { signUpSchema, type SignUpValues } from '@/lib/validations'

export function SignUpPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { role: 'employee' },
  })

  const role = watch('role')

  const onSubmit = handleSubmit(async (values) => {
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          first_name: values.firstName,
          last_name: values.lastName,
          phone: values.phone,
          role: values.role,
          company_name: values.companyName,
          trade_specialization: values.tradeSpecialization,
        },
      },
    })

    if (error) {
      toast.error(error.message)
      return
    }

    // Clear any auto-created session so the user lands on sign-in, not pending-approval
    await supabase.auth.signOut()

    toast.success('Registration submitted. You can sign in after management approves your account.')
    navigate('/sign-in', { replace: true })
  })

  return (
    <AuthLayout>
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Register as an employee or subcontractor. Approval is required.</CardDescription>
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
              <Input id="email" type="email" {...register('email')} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register('phone')} />
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setValue('role', value as SignUpValues['role'])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === 'subcontractor' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input id="companyName" {...register('companyName')} />
                  {errors.companyName ? <p className="text-xs text-destructive">{errors.companyName.message}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tradeSpecialization">Trade specialization</Label>
                  <Input id="tradeSpecialization" {...register('tradeSpecialization')} />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
              {isSubmitting ? 'Submitting...' : 'Register'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            Already registered?{' '}
            <Link className="text-primary hover:underline" to="/sign-in">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
