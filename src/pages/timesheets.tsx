import { TimesheetsPanel } from '@/features/attendance/timesheets'

export function TimesheetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-wide">Timesheets</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor daily attendance, filter labor hours, and correct records when needed.
        </p>
      </div>
      <TimesheetsPanel />
    </div>
  )
}
