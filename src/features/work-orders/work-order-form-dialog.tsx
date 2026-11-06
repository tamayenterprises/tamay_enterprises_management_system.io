import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSaveWorkOrder, type WorkOrderFormValues } from '@/features/work-orders/hooks'
import { SubcontractorPicker } from '@/features/work-orders/subcontractor-picker'
import { DEFAULT_WARRANTY_NOTE } from '@/lib/work-orders'
import type { WorkOrderRecord } from '@/types/database'

function initialValues(projectId: string, workOrder?: WorkOrderRecord | null): WorkOrderFormValues {
  return {
    project_id: projectId,
    subcontractor_ids: [],
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
    insurance_required: workOrder?.insurance_required ?? false,
    certificate_holder: workOrder?.certificate_holder ?? '',
  }
}

/** Create (and send to one or more subcontractors) or edit a work order (management). */
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
  const creating = !workOrder

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
      const count = values.subcontractor_ids.length
      toast.success(
        workOrder ? 'Work order updated' : `Work order sent to ${count} subcontractor${count === 1 ? '' : 's'} — the first to accept gets it`,
      )
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
          <DialogTitle>{creating ? 'Create Work Order' : 'Edit Work Order'}</DialogTitle>
          <DialogDescription>Only what the subcontractor needs: scope, specs, price, dates and job requirements.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {creating ? (
            <SubcontractorPicker
              selected={values.subcontractor_ids}
              onChange={(ids, firstTrade) =>
                setValues((current) => ({ ...current, subcontractor_ids: ids, trade: current.trade || firstTrade || '' }))
              }
            />
          ) : null}
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
            <legend className="px-1 text-sm font-medium">Insurance certificate</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary"
                checked={values.insurance_required}
                onChange={(event) => set('insurance_required', event.target.checked)}
              />
              <span>
                Required for this work order — the subcontractor uploads it and Tamay approves it before work can start.
              </span>
            </label>
            {values.insurance_required ? (
              <div className="space-y-1">
                <Label htmlFor="wo-certificate_holder">Certificate Holder (name and address)</Label>
                <Textarea
                  id="wo-certificate_holder"
                  rows={2}
                  maxLength={500}
                  placeholder={'Client name\nStreet, City, State ZIP'}
                  value={values.certificate_holder}
                  onChange={(event) => set('certificate_holder', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Usually the client. The subcontractor only sees this name and address, not the client's contact details.
                </p>
              </div>
            ) : null}
          </fieldset>
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
          {creating ? (
            <p className="text-xs text-muted-foreground">
              After creating, add the contract, proposal, plans and photos in the work order's Contract & Documents section.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => void onSubmit()}>
              {save.isPending ? 'Saving…' : creating ? 'Create & Send' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
