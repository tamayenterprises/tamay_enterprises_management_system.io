import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useProfiles } from '@/features/data/hooks'
import { useSubcontractorReadiness } from '@/features/subcontractors/hooks'
import { useSaveWorkOrder, type WorkOrderFormValues } from '@/features/work-orders/hooks'
import { fullName } from '@/lib/utils'
import { DEFAULT_WARRANTY_NOTE } from '@/lib/work-orders'
import type { WorkOrderRecord } from '@/types/database'

function initialValues(projectId: string, workOrder?: WorkOrderRecord | null): WorkOrderFormValues {
  return {
    project_id: projectId,
    subcontractor_id: workOrder?.subcontractor_id ?? '',
    trade: workOrder?.trade ?? '',
    title: workOrder?.title ?? '',
    scope_of_work: workOrder?.scope_of_work ?? '',
    measurements_and_specs: workOrder?.measurements_and_specs ?? '',
    important_requirements: workOrder?.important_requirements ?? '',
    agreed_price: workOrder?.agreed_price != null ? String(workOrder.agreed_price) : '',
    start_date: workOrder?.start_date ?? '',
    target_completion_date: workOrder?.target_completion_date ?? '',
    payment_notes: workOrder?.payment_notes ?? '',
    warranty_applies: workOrder?.warranty_applies ?? false,
    warranty_notes: workOrder?.warranty_notes ?? '',
  }
}

/** Create or edit a work order (management). */
export function WorkOrderFormDialog({
  open,
  onOpenChange,
  projectId,
  workOrder,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workOrder?: WorkOrderRecord | null
  onSaved?: (id: string) => void
}) {
  const save = useSaveWorkOrder()
  const [values, setValues] = useState<WorkOrderFormValues>(() => initialValues(projectId, workOrder))
  const { data: subcontractors = [] } = useProfiles({ role: 'subcontractor' })
  const options = subcontractors.filter((p) => p.approval_status === 'approved' && p.is_active && !p.archived_at)
  const { data: readiness } = useSubcontractorReadiness(options.map((p) => p.id))
  const selectedReadiness = values.subcontractor_id ? readiness?.get(values.subcontractor_id) : null
  const notReady = selectedReadiness && selectedReadiness.status !== 'ready'

  const set = <K extends keyof WorkOrderFormValues>(key: K, value: WorkOrderFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const text = (key: keyof WorkOrderFormValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`wo-${key}`}>{label}</Label>
      <Input id={`wo-${key}`} value={values[key] as string} onChange={(event) => set(key, event.target.value as never)} {...props} />
    </div>
  )
  const area = (key: keyof WorkOrderFormValues, label: string, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`wo-${key}`}>{label}</Label>
      <Textarea
        id={`wo-${key}`}
        value={values[key] as string}
        placeholder={placeholder}
        rows={3}
        onChange={(event) => set(key, event.target.value as never)}
      />
    </div>
  )

  async function onSubmit() {
    try {
      const id = await save.mutateAsync({ id: workOrder?.id, values })
      toast.success(workOrder ? 'Work order updated' : 'Work order created and sent to the subcontractor')
      onOpenChange(false)
      onSaved?.(id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the work order')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workOrder ? 'Edit Work Order' : 'Create Work Order'}</DialogTitle>
          <DialogDescription>Only what the subcontractor needs: scope, specs, price, dates and job requirements.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wo-subcontractor">Subcontractor</Label>
            <NativeSelect
              id="wo-subcontractor"
              value={values.subcontractor_id}
              onChange={(event) => {
                const sub = options.find((p) => p.id === event.target.value)
                setValues((current) => ({
                  ...current,
                  subcontractor_id: event.target.value,
                  trade: current.trade || sub?.trade_specialization || '',
                }))
              }}
            >
              <option value="">Choose subcontractor</option>
              {options.map((p) => {
                const status = readiness?.get(p.id)?.status
                return (
                  <option key={p.id} value={p.id}>
                    {p.company_name || fullName(p.first_name, p.last_name)}
                    {p.trade_specialization ? ` · ${p.trade_specialization}` : ''}
                    {status && status !== 'ready' ? ' — NOT READY TO WORK' : ''}
                  </option>
                )
              })}
            </NativeSelect>
            {notReady ? (
              <p className="text-xs font-semibold text-destructive" role="alert">
                NOT READY TO WORK — {[...selectedReadiness.attention_labels, ...selectedReadiness.missing_labels, ...selectedReadiness.pending_labels].join(', ') ||
                  'documents are not approved yet'}. You can still assign; they cannot start until Ready.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {text('trade', 'Trade / specialty', { placeholder: 'Plumbing, Electrical, Tile…', maxLength: 120 })}
            {text('title', 'Title', { placeholder: 'Rough-in plumbing, 2nd floor bath', maxLength: 160 })}
          </div>
          {area('scope_of_work', 'Scope of work', 'What exactly this subcontractor is responsible for')}
          {area('measurements_and_specs', 'Measurements & specifications', 'Sizes, fixtures, materials, models…')}
          {area('important_requirements', 'Important job requirements', 'Protect finished floors · keep area clean · photos before covering concealed work · notify Tamay before scope changes')}
          <div className="grid gap-3 sm:grid-cols-3">
            {text('agreed_price', 'Agreed subcontractor price ($)', { inputMode: 'decimal', placeholder: '4500' })}
            {text('start_date', 'Start date', { type: 'date' })}
            {text('target_completion_date', 'Target completion', { type: 'date' })}
          </div>
          {text('payment_notes', 'Payment notes (optional)', { placeholder: 'Paid on completion and approval', maxLength: 1000 })}
          <fieldset className="space-y-2 rounded-md border border-border px-3 py-2">
            <legend className="px-1 text-sm font-medium">Warranty responsibility</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="warranty"
                  className="accent-primary"
                  checked={values.warranty_applies}
                  onChange={() =>
                    setValues((current) => ({ ...current, warranty_applies: true, warranty_notes: current.warranty_notes || DEFAULT_WARRANTY_NOTE }))
                  }
                />
                Applies
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="warranty" className="accent-primary" checked={!values.warranty_applies} onChange={() => set('warranty_applies', false)} />
                Does Not Apply
              </label>
            </div>
            {values.warranty_applies ? area('warranty_notes', 'Warranty notes') : null}
          </fieldset>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => void onSubmit()}>
              {save.isPending ? 'Saving…' : workOrder ? 'Save changes' : 'Create Work Order'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
