import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuth } from '@/features/auth/auth-hooks'
import { useCompanyProfile, useSaveCompanyProfile } from '@/features/subcontractors/hooks'

/** Subcontractor's own company details. Email changes go through Tamay. */
export function CompanyProfilePage() {
  const { profile } = useAuth()
  const { data: company, isLoading } = useCompanyProfile(profile?.id)
  const save = useSaveCompanyProfile()
  const [values, setValues] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    phone: '',
    trade_specialization: '',
    business_address: '',
  })

  useEffect(() => {
    if (!profile) return
    setValues({
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      company_name: profile.company_name ?? '',
      phone: profile.phone ?? '',
      trade_specialization: profile.trade_specialization ?? '',
      business_address: company?.business_address ?? '',
    })
  }, [profile, company])

  if (!profile || isLoading) return <LoadingState label="Loading company profile..." />

  const field = (key: keyof typeof values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`company-${key}`}>{label}</Label>
      <Input
        id={`company-${key}`}
        value={values[key]}
        onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
        {...props}
      />
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-semibold">Company Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business details</CardTitle>
          <CardDescription>Tamay uses these details for work orders and payments. Email: {profile.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!values.first_name.trim() || !values.last_name.trim()) {
                toast.error('First and last name are required.')
                return
              }
              if (!values.company_name.trim()) {
                toast.error('Company name is required.')
                return
              }
              save
                .mutateAsync({ profileId: profile.id, ...values })
                .then(() => toast.success('Company profile saved'))
                .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Save failed'))
            }}
          >
            {field('company_name', 'Company name', { maxLength: 120 })}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('first_name', 'Primary contact first name')}
              {field('last_name', 'Primary contact last name')}
            </div>
            {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel' })}
            {field('trade_specialization', 'Trade / specialty', { placeholder: 'Plumbing, Electrical, Painting…' })}
            {field('business_address', 'Business address', { maxLength: 300, autoComplete: 'street-address' })}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save Company Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
