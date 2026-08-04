import { TimesheetsPanel } from '@/features/attendance/timesheets'

export function TimesheetsPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-wide">Timesheets</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Monitor daily attendance, filter labor hours, and correct records when needed.
        </p>
      </div>
      <TimesheetsPanel />
    </div>
  )
}
