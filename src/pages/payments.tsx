import { useMemo, useState } from 'react'
import { Copy, ExternalLink, Link2, Plus, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-hooks'
import { useCreatePaymentLink, usePayments } from '@/features/payments/hooks'
import { useProfiles, useProjects } from '@/features/data/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { EmptyState } from '@/components/ui/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDate, fullName, isManagementRole } from '@/lib/utils'
import type { PaymentStatus } from '@/types/database'

const statusLabel: Record<PaymentStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  expired: 'Expired',
  canceled: 'Canceled',
}

function money(amountCents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

export function PaymentsPage() {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const { data: payments = [], isLoading, isError } = usePayments()
  const { data: projects = [] } = useProjects({ assignedOnly: false })
  const { data: profiles = [] } = useProfiles({ role: ['client', 'employee', 'subcontractor'] })
  const createLink = useCreatePaymentLink()
  const [projectId, setProjectId] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [payerEmail, setPayerEmail] = useState('')

  const recipients = useMemo(
    () => profiles.filter((item) => item.is_active),
    [profiles],
  )

  const copyLink = async (url: string) => {
    await navigator.clipboard?.writeText(url)
    toast.success('Payment link copied.')
  }

  const submit = async () => {
    const amountCents = Math.round(Number(amount) * 100)
    if (!projectId || !description.trim() || !Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error('Choose a project, then enter a valid amount and description.')
      return
    }
    try {
      const payment = await createLink.mutateAsync({
        projectId,
        recipientId: recipientId || undefined,
        amountCents,
        description: description.trim(),
        payerEmail: payerEmail.trim() || undefined,
      })
      setAmount('')
      setDescription('')
      setPayerEmail('')
      setProjectId('')
      setRecipientId('')
      if (payment.payment_link_url) await copyLink(payment.payment_link_url)
      else toast.success('Payment link created.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create payment link')
    }
  }

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load payment history" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Payment History</h1>
        <p className="text-sm text-muted-foreground">
          Set the amount in the app, create a Stripe link, and send it. Each installment (for example 50%, then the remaining 50%) is its own row.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Send a payment link
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Bill to (optional)</Label>
              <Select value={recipientId || 'none'} onValueChange={(value) => setRecipientId(value === 'none' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="No person selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No person selected</SelectItem>
                  {recipients.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {fullName(item.first_name, item.last_name)} ({item.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount (USD)</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Customer email (optional)</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={payerEmail}
                onChange={(event) => setPayerEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input
                placeholder="Deposit 50% — kitchen remodel"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => void submit()} disabled={createLink.isPending}>
                <Link2 className="mr-2 h-4 w-4" />
                {createLink.isPending ? 'Creating...' : 'Create Stripe link'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" /> Received payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" description="Payment links and completed payments will appear here." />
          ) : (
            <div className="divide-y divide-border">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{payment.description}</span>
                      <Badge variant={payment.status === 'paid' ? 'default' : 'secondary'}>
                        {statusLabel[payment.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {payment.project?.name ?? 'Project'}
                      {payment.recipient
                        ? ` · ${fullName(payment.recipient.first_name, payment.recipient.last_name)}`
                        : ''}
                      {' · '}
                      {formatDate(payment.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">{money(payment.amount_cents, payment.currency)}</span>
                    {payment.payment_link_url && payment.status === 'pending' ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void copyLink(payment.payment_link_url!)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy link
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <a href={payment.payment_link_url} target="_blank" rel="noreferrer" aria-label="Open payment link">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
